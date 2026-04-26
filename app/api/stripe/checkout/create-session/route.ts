import { NextResponse } from "next/server";
import { getCurrentAccountContext } from "@/lib/auth/getCurrentAccountContext";
import { getPurchaseRestrictionMessage } from "@/lib/auth/purchaseAccess";
import {
  BUSINESS_FULFILLMENT_SELECT,
  DELIVERY_FULFILLMENT_TYPE,
  deriveFulfillmentSummary,
  LISTING_FULFILLMENT_SELECT,
} from "@/lib/fulfillment";
import { getListingUrl } from "@/lib/ids/publicRefs";
import { isUuid } from "@/lib/ids/isUuid";
import { createOrderWithItems } from "@/lib/orders/persistence";
import {
  applyInventoryReservationsToItems,
  reserveInventoryForOrderItems,
  restoreInventoryReservations,
} from "@/lib/orders/inventoryReservations";
import { STRIPE_PENDING_ORDER_STATUS } from "@/lib/orders/marketplace";
import { MAX_ORDER_QUANTITY, validateOrderQuantity } from "@/lib/inventory";
import { getAppUrl, getStripe, dollarsToCents } from "@/lib/stripe";
import { getStripeModeFromSecretKey, getStripeSecretKey } from "@/lib/stripe/env";
import { getBusinessStripeStatus } from "@/lib/stripe/status";
import { getSupabaseServerClient as getServiceClient } from "@/lib/supabase/server";
import { getSupabaseServerClient, getUserCached } from "@/lib/supabaseServer";
import { normalizeStateCode } from "@/lib/location/normalizeStateCode";
import { calculateCheckoutPricing } from "@/lib/pricing";
import { getVariantInventoryListing } from "@/lib/listingOptions";
import { assertListingPurchasable } from "@/lib/seededListings";

function jsonError(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function isStockError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("stock") ||
    message.includes("available") ||
    message.includes("order up to") ||
    message.includes("at least 1")
  );
}

async function resolveListingId(client: any, listingRef: string) {
  const trimmed = String(listingRef || "").trim();
  if (!trimmed) return null;

  const { data } = await client.rpc("resolve_listing_ref", {
    p_ref: trimmed,
  });
  if (Array.isArray(data) && data[0]?.id) return data[0].id;

  const { data: listing } = await client
    .from("listings")
    .select("id")
    .eq(isUuid(trimmed) ? "id" : "public_id", trimmed)
    .maybeSingle();

  return listing?.id || null;
}

async function getActiveCart(
  client: any,
  userId: string,
  { cartId, businessId }: { cartId?: string | null; businessId?: string | null } = {}
) {
  const query = client
    .from("carts")
    .select("*, cart_items(*)")
    .eq("user_id", userId)
    .eq("status", "active");

  if (cartId) {
    query.eq("id", cartId);
  }
  if (businessId) {
    query.eq("vendor_id", businessId);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load cart");
  }

  return data || null;
}

async function getListingVariantsByIds(client: any, variantIds: string[]) {
  if (!variantIds.length) return new Map();

  const { data, error } = await client
    .from("listing_variants")
    .select("id,listing_id,price,quantity,is_active")
    .in("id", variantIds);

  if (error) {
    throw new Error(error.message || "Failed to load listing variants");
  }

  return new Map((Array.isArray(data) ? data : []).map((variant) => [variant.id, variant]));
}

export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient();
  const { user, error: userError } = await getUserCached(supabase);

  if (userError || !user?.id) {
    return jsonError("Unauthorized", 401);
  }

  const accountContext = await getCurrentAccountContext({
    request,
    supabase,
    source: "api/stripe/checkout/create-session",
  });
  if (!accountContext.canPurchase && accountContext.isRoleResolved) {
    return jsonError(getPurchaseRestrictionMessage(), 403, {
      code: "CUSTOMER_ACCOUNT_REQUIRED",
    });
  }

  const serviceClient = getServiceClient();
  if (!serviceClient) {
    return jsonError("Missing server data client", 500);
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const listingRef = String(body?.listingId || body?.listing_id || "").trim();
  const cartId = String(body?.cart_id || "").trim() || null;
  const businessId = String(body?.business_id || "").trim() || null;
  const variantId = String(body?.variant_id || "").trim() || null;
  const variantLabel = String(body?.variant_label || "").trim() || null;
  const selectedOptions =
    body?.selected_options && typeof body.selected_options === "object"
      ? body.selected_options
      : null;
  const quantity = Number(body?.quantity || 1);
  const fulfillmentType =
    body?.fulfillmentType === "delivery" || body?.fulfillment_type === "delivery"
      ? "delivery"
      : "pickup";
  const checkoutFlow = cartId || businessId ? "cart_checkout" : "buy_now";

  const contactName = String(body?.contact_name || "").trim();
  const contactPhone = String(body?.contact_phone || "").trim();
  const contactEmail = String(body?.contact_email || user.email || "").trim() || null;
  const deliveryAddress1 = String(body?.delivery_address1 || "").trim() || null;
  const deliveryAddress2 = String(body?.delivery_address2 || "").trim() || null;
  const deliveryCity = String(body?.delivery_city || "").trim() || null;
  const deliveryState = normalizeStateCode(body?.delivery_state) || null;
  const deliveryPostal = String(body?.delivery_postal_code || "").trim() || null;
  const deliveryInstructions = String(body?.delivery_instructions || "").trim() || null;
  const deliveryTime = String(body?.delivery_time || "").trim() || "ASAP";
  const pickupTime = String(body?.pickup_time || "").trim() || "ASAP";

  if (!contactName || !contactPhone) {
    return jsonError("Add your name and phone number before checkout.", 400, {
      code: "CUSTOMER_PROFILE_INCOMPLETE",
    });
  }

  if (fulfillmentType === "delivery" && (!deliveryAddress1 || !deliveryCity || !deliveryState)) {
    return jsonError(
      "Add your delivery address, city, and state before using delivery checkout.",
      400,
      { code: "CUSTOMER_ADDRESS_INCOMPLETE" }
    );
  }

  let business:
    | {
        id: string;
        owner_user_id: string;
        business_name?: string | null;
        stripe_account_id?: string | null;
        stripe_charges_enabled?: boolean | null;
        stripe_payouts_enabled?: boolean | null;
        stripe_details_submitted?: boolean | null;
      }
    | null = null;
  let orderItems: Array<{
    listing_id: string | null;
    variant_id?: string | null;
    variant_label?: string | null;
    selected_options?: Record<string, string> | null;
    title: string;
    unit_price: number;
    image_url: string | null;
    quantity: number;
  }> = [];
  let subtotalCents = 0;
  let deliveryFeeCents = 0;
  let fulfillmentListings: any[] = [];
  let cancelPath = "";
  let orderInput: Record<string, unknown> = {
    user_id: user.id,
    status: STRIPE_PENDING_ORDER_STATUS,
    fulfillment_type: fulfillmentType,
    contact_name: contactName,
    contact_phone: contactPhone,
    contact_email: contactEmail,
    delivery_address1: fulfillmentType === "delivery" ? deliveryAddress1 : null,
    delivery_address2: fulfillmentType === "delivery" ? deliveryAddress2 : null,
    delivery_city: fulfillmentType === "delivery" ? deliveryCity : null,
    delivery_state: fulfillmentType === "delivery" ? deliveryState : null,
    delivery_postal_code: fulfillmentType === "delivery" ? deliveryPostal : null,
    delivery_instructions: fulfillmentType === "delivery" ? deliveryInstructions : null,
    delivery_time: fulfillmentType === "delivery" ? deliveryTime : null,
    pickup_time: fulfillmentType === "pickup" ? pickupTime : null,
    fees: 0,
    currency: "usd",
    updated_at: new Date().toISOString(),
  };

  if (checkoutFlow === "buy_now") {
    if (!listingRef) {
      return jsonError("Missing listing id", 400);
    }

    const listingId = await resolveListingId(serviceClient, listingRef);
    if (!listingId) {
      return jsonError("Listing not found", 404);
    }

    const { data: listing, error: listingError } = await serviceClient
      .from("listings")
      .select(
        `id,public_id,title,price,photo_url,business_id,inventory_status,inventory_quantity,${LISTING_FULFILLMENT_SELECT}`
      )
      .eq("id", listingId)
      .maybeSingle();

    if (listingError) {
      return jsonError(listingError.message || "Failed to load listing", 500);
    }
    if (!listing?.id) {
      return jsonError("Listing not found", 404);
    }

    const { data: firstActiveVariant } = await serviceClient
      .from("listing_variants")
      .select("id")
      .eq("listing_id", listing.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    let activeVariant: any = null;
    if (variantId) {
      const { data: variant, error: variantError } = await serviceClient
        .from("listing_variants")
        .select("id,listing_id,price,quantity,is_active")
        .eq("id", variantId)
        .maybeSingle();

      if (variantError) {
        return jsonError(variantError.message || "Failed to load variant", 500);
      }
      if (!variant?.id || variant.listing_id !== listing.id || variant.is_active === false) {
        return jsonError("Select a valid product option before checkout.", 400);
      }
      activeVariant = variant;
    } else if (firstActiveVariant?.id) {
      return jsonError("Select a product option before checkout.", 400);
    }

    const purchasableListing = activeVariant
      ? getVariantInventoryListing(listing, activeVariant)
      : listing;
    try {
      assertListingPurchasable(purchasableListing);
    } catch (error: any) {
      return jsonError(error?.message || "This preview item is not available for purchase yet.", 400, {
        code: error?.code || "SEEDED_LISTING_NOT_PURCHASABLE",
      });
    }

    if (String(purchasableListing.inventory_status || "").trim() === "out_of_stock") {
      return jsonError("This item is currently out of stock", 400);
    }

    const quantityValidation = validateOrderQuantity(quantity, purchasableListing);
    if (!quantityValidation.ok) {
      return jsonError(quantityValidation.message, 409, {
        code: quantityValidation.code,
        maxQuantity: quantityValidation.maxQuantity,
      });
    }

    const resolvedUnitPrice =
      activeVariant?.price !== null && activeVariant?.price !== undefined
        ? Number(activeVariant.price)
        : Number(listing.price || 0);
    const unitAmount = dollarsToCents(resolvedUnitPrice);
    if (unitAmount <= 0) {
      return jsonError("This listing is not available for Stripe checkout yet", 400);
    }

    const { data: businessData, error: businessError } = await serviceClient
      .from("businesses")
      .select(
        [
          "id",
          "owner_user_id",
          "business_name",
          BUSINESS_FULFILLMENT_SELECT,
          "stripe_account_id",
          "stripe_charges_enabled",
          "stripe_payouts_enabled",
          "stripe_details_submitted",
        ].join(",")
      )
      .eq("owner_user_id", listing.business_id)
      .maybeSingle();

    if (businessError) {
      return jsonError(businessError.message || "Failed to load business", 500);
    }
    if (!businessData?.id) {
      return jsonError("Business not found", 404);
    }

    business = businessData;
    orderItems = [
      {
        listing_id: listing.id,
        variant_id: activeVariant?.id || null,
        variant_label: variantLabel || null,
        selected_options: selectedOptions || null,
        title: listing.title,
        unit_price: resolvedUnitPrice,
        image_url: listing.photo_url || null,
        quantity: quantityValidation.quantity,
      },
    ];
    subtotalCents = unitAmount * quantityValidation.quantity;
    fulfillmentListings = [listing];
    cancelPath = getListingUrl(listing);
    orderInput = {
      ...orderInput,
      vendor_id: business.owner_user_id,
    };
  } else {
    const activeCart = await getActiveCart(serviceClient, user.id, {
      cartId,
      businessId,
    });

    if (!activeCart?.id) {
      return jsonError("Cart not found", 404);
    }

    const items = Array.isArray(activeCart.cart_items) ? activeCart.cart_items : [];
    if (!items.length) {
      return jsonError("Cart is empty", 400);
    }

    const { data: businessData, error: businessError } = await serviceClient
      .from("businesses")
      .select(
        [
          "id",
          "owner_user_id",
          "business_name",
          BUSINESS_FULFILLMENT_SELECT,
          "stripe_account_id",
          "stripe_charges_enabled",
          "stripe_payouts_enabled",
          "stripe_details_submitted",
        ].join(",")
      )
      .eq("owner_user_id", activeCart.vendor_id)
      .maybeSingle();

    if (businessError) {
      return jsonError(businessError.message || "Failed to load business", 500);
    }
    if (!businessData?.id) {
      return jsonError("Business not found", 404);
    }

    business = businessData;
    orderItems = items.map((item: any) => ({
      listing_id: item?.listing_id || null,
      title: String(item?.title || "Marketplace order").trim() || "Marketplace order",
      unit_price: Number(item?.unit_price || 0),
      image_url: item?.image_url || null,
      quantity: Number(item?.quantity || 1),
    }));

    for (const item of orderItems) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_ORDER_QUANTITY) {
        return jsonError(`You can order up to ${MAX_ORDER_QUANTITY} of each item at a time.`, 409, {
          code: "MAX_QUANTITY_EXCEEDED",
          listingId: item.listing_id,
        });
      }
    }
    subtotalCents = orderItems.reduce((sum, item) => {
      const unitAmount = dollarsToCents(item.unit_price);
      return sum + unitAmount * item.quantity;
    }, 0);

    if (subtotalCents <= 0) {
      return jsonError("Your cart is not available for Stripe checkout yet", 400);
    }

    const listingIds = items.map((item: any) => item?.listing_id).filter(Boolean);
    if (listingIds.length > 0) {
      const { data: listingRows, error: listingRowsError } = await serviceClient
        .from("listings")
        .select(`id,business_id,title,price,inventory_status,inventory_quantity,is_seeded,${LISTING_FULFILLMENT_SELECT}`)
        .in("id", listingIds);

      if (listingRowsError) {
        return jsonError(listingRowsError.message || "Failed to load listing fulfillment", 500);
      }

      fulfillmentListings = Array.isArray(listingRows) ? listingRows : [];
      const listingById = new Map(fulfillmentListings.map((listing: any) => [listing.id, listing]));
      const variantById = await getListingVariantsByIds(
        serviceClient,
        items.map((item: any) => item?.variant_id).filter(Boolean)
      );
      const removedItems: any[] = [];
      const adjustedItems: any[] = [];
      const repricedItems: any[] = [];

      orderItems = orderItems.map((item: any, index: number) => ({
        ...item,
        variant_id: items[index]?.variant_id || null,
        variant_label: items[index]?.variant_label || null,
        selected_options: items[index]?.selected_options || null,
      }));

      for (const item of orderItems) {
        const currentListing: any = listingById.get(item.listing_id);
        if (!currentListing) {
          removedItems.push({
            listing_id: item.listing_id,
            title: item.title,
            reason: "Listing is no longer available.",
          });
          continue;
        }

        const currentVariant = item.variant_id ? variantById.get(item.variant_id) : null;
        if (item.variant_id && (!currentVariant || currentVariant.is_active === false)) {
          removedItems.push({
            listing_id: item.listing_id,
            variant_id: item.variant_id,
            title: item.title,
            reason: "Selected option is no longer available.",
          });
          continue;
        }

        const purchasableListing = currentVariant
          ? getVariantInventoryListing(currentListing, currentVariant)
          : currentListing;
        try {
          assertListingPurchasable(purchasableListing);
        } catch (error: any) {
          removedItems.push({
            listing_id: item.listing_id,
            variant_id: item.variant_id || null,
            title: item.title,
            reason: error?.message || "This preview item is not available for purchase yet.",
          });
          continue;
        }
        const quantityValidation = validateOrderQuantity(item.quantity, purchasableListing);

        if (quantityValidation.code === "OUT_OF_STOCK") {
          removedItems.push({
            listing_id: item.listing_id,
            variant_id: item.variant_id || null,
            title: item.title,
            reason: "Item is sold out.",
          });
        } else if (!quantityValidation.ok) {
          adjustedItems.push({
            listing_id: item.listing_id,
            variant_id: item.variant_id || null,
            title: item.title,
            requestedQuantity: item.quantity,
            availableQuantity: quantityValidation.maxQuantity,
          });
        }

        const currentUnitPrice =
          currentVariant?.price !== null && currentVariant?.price !== undefined
            ? Number(currentVariant.price)
            : Number(currentListing.price || 0);
        const currentUnitCents = dollarsToCents(currentUnitPrice);
        const cartUnitCents = dollarsToCents(item.unit_price);
        if (currentUnitCents !== cartUnitCents) {
          repricedItems.push({
            listing_id: item.listing_id,
            variant_id: item.variant_id || null,
            title: item.title,
            cartUnitPrice: item.unit_price,
            currentUnitPrice,
          });
        }
      }

      if (removedItems.length || adjustedItems.length || repricedItems.length) {
        return jsonError("Some cart items changed before checkout.", 409, {
          code: "CART_REVALIDATION_REQUIRED",
          removedItems,
          adjustedItems,
          repricedItems,
          cleanCart: false,
        });
      }
    }

    cancelPath = businessData.owner_user_id
      ? `/checkout?business_id=${encodeURIComponent(businessData.owner_user_id)}`
      : "/checkout";
    orderInput = {
      ...orderInput,
      vendor_id: business.owner_user_id,
      cart_id: activeCart.id,
    };
  }

  if (!business?.id) {
    return jsonError("Business not found", 404);
  }

  const fulfillmentSummary = deriveFulfillmentSummary({
    listings: fulfillmentListings,
    business,
    subtotalCents,
    currentFulfillmentType: fulfillmentType,
  });

  if (!fulfillmentSummary.availableMethods.includes(fulfillmentType)) {
    return jsonError(
      fulfillmentSummary.deliveryUnavailableReason ||
        "That fulfillment option is not available for this order.",
      400
    );
  }

  deliveryFeeCents =
    fulfillmentType === DELIVERY_FULFILLMENT_TYPE
      ? fulfillmentSummary.deliveryFeeCents
      : 0;

  const stripeStatus = getBusinessStripeStatus({
    stripeAccountId: business.stripe_account_id,
    chargesEnabled: business.stripe_charges_enabled,
    payoutsEnabled: business.stripe_payouts_enabled,
    detailsSubmitted: business.stripe_details_submitted,
    mode: getStripeModeFromSecretKey(getStripeSecretKey()),
  });

  if (!stripeStatus.hasStripeAccount) {
    return jsonError("This business has not connected Stripe yet", 400);
  }
  if (!stripeStatus.canAcceptPayments) {
    return jsonError("This business is not ready to accept payments yet", 400);
  }
  const pricing = calculateCheckoutPricing({
    subtotalCents,
    deliveryFeeCents,
    taxCents: 0,
  });
  const platformFeeAmount = pricing.platformFeeCents;
  const totalCents = pricing.totalCents;
  const subtotal = subtotalCents / 100;
  const fees = platformFeeAmount / 100;
  const total = totalCents / 100;
  orderInput = {
    ...orderInput,
    subtotal,
    fees,
    total,
    delivery_fee_cents_snapshot: deliveryFeeCents,
    delivery_notes_snapshot:
      fulfillmentType === DELIVERY_FULFILLMENT_TYPE
        ? fulfillmentSummary.deliveryNotes
        : null,
  };
  let orderRecord:
    | { id: string; order_number: string; status?: string | null; vendor_id?: string | null; user_id?: string | null }
    | null = null;
  let inventoryReserved = false;
  let inventoryReservations: any[] = [];

  try {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[STRIPE_BUY_NOW_TRACE]", "create_session_start", {
        listingId: orderItems[0]?.listing_id || null,
        businessId: business.id,
        vendorUserId: business.owner_user_id,
        customerUserId: user.id,
        quantity: orderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        fulfillmentType,
        checkoutFlow,
        subtotalCents,
        platformFeeAmount,
        totalCents,
      });
    }

    // Stock is guaranteed here: each RPC performs one conditional
    // UPDATE listings SET inventory_quantity = inventory_quantity - qty
    // WHERE id = listing_id AND inventory_quantity >= qty.
    inventoryReservations = await reserveInventoryForOrderItems({ client: serviceClient, items: orderItems });
    inventoryReserved = true;
    orderItems = applyInventoryReservationsToItems(orderItems, inventoryReservations);

    orderRecord = await createOrderWithItems({
      client: serviceClient,
      logPrefix: "[STRIPE_BUY_NOW_TRACE]",
      order: {
        ...orderInput,
        inventory_reserved_at: new Date().toISOString(),
        platform_fee_amount: platformFeeAmount,
      },
      items: orderItems,
    });

    if (process.env.NODE_ENV !== "production") {
      console.warn("[STRIPE_BUY_NOW_TRACE]", "create_order_ready_for_checkout", {
        orderId: orderRecord.id,
        orderNumber: orderRecord.order_number,
        checkoutFlow,
        subtotalCents,
        platformFeeAmount,
        totalCents,
      });
    }

    const stripe = getStripe();
    const appUrl = getAppUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${appUrl}/orders/${encodeURIComponent(
        orderRecord.order_number
      )}?checkout_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}${cancelPath}`,
      line_items: orderItems.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: "usd",
          unit_amount: dollarsToCents(item.unit_price),
          product_data: {
            name: item.title || "Marketplace order",
          },
        },
      }))
      .concat(
        deliveryFeeCents > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: "usd",
                  unit_amount: deliveryFeeCents,
                  product_data: {
                    name: "Local delivery fee",
                  },
                },
              },
            ]
          : []
      )
      .concat(
        platformFeeAmount > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: "usd",
                  unit_amount: platformFeeAmount,
                  product_data: {
                    name: "Service fee",
                  },
                },
              },
            ]
          : []
      ),
      customer_email: contactEmail || user.email?.trim() || undefined,
      metadata: {
        checkout_flow: checkoutFlow,
        order_id: orderRecord.id,
        order_number: orderRecord.order_number,
        listing_id: orderItems[0]?.listing_id || "",
        business_id: business.id,
        vendor_user_id: business.owner_user_id,
        customer_user_id: user.id,
        fulfillment_type: fulfillmentType,
        quantity: String(orderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)),
        cart_id: String(cartId || orderInput.cart_id || ""),
        subtotal_cents: String(subtotalCents),
        delivery_fee_cents: String(deliveryFeeCents),
        platform_fee_amount: String(platformFeeAmount),
        total_cents: String(totalCents),
      },
      payment_intent_data: {
        application_fee_amount: platformFeeAmount,
        transfer_data: {
          destination: stripeStatus.accountId!,
        },
        metadata: {
          checkout_flow: checkoutFlow,
          order_id: orderRecord.id,
          listing_id: orderItems[0]?.listing_id || "",
          business_id: business.id,
          vendor_user_id: business.owner_user_id,
          customer_user_id: user.id,
          fulfillment_type: fulfillmentType,
          quantity: String(orderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)),
          cart_id: String(cartId || orderInput.cart_id || ""),
          subtotal_cents: String(subtotalCents),
          delivery_fee_cents: String(deliveryFeeCents),
          platform_fee_amount: String(platformFeeAmount),
          total_cents: String(totalCents),
        },
      },
    });

    const { error: orderUpdateError } = await serviceClient
      .from("orders")
      .update({
        stripe_checkout_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderRecord.id)
      .eq("user_id", user.id);

    if (orderUpdateError) {
      throw new Error(orderUpdateError.message || "Failed to update order session");
    }

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }

    if (process.env.NODE_ENV !== "production") {
      console.warn("[STRIPE_BUY_NOW_TRACE]", "create_session_success", {
        sessionId: session.id,
        orderId: orderRecord.id,
        orderNumber: orderRecord.order_number,
        listingId: orderItems[0]?.listing_id || null,
        businessId: business.id,
        vendorUserId: business.owner_user_id,
        customerUserId: user.id,
        fulfillmentType,
        checkoutFlow,
        subtotalCents,
        platformFeeAmount,
        totalCents,
      });
    }

    return NextResponse.json(
      {
        url: session.url,
        orderId: orderRecord.id,
        orderNumber: orderRecord.order_number,
        subtotal,
        deliveryFee: deliveryFeeCents / 100,
        fees,
        total,
      },
      { status: 200 }
    );
  } catch (error: any) {
    if (orderRecord?.id) {
      await serviceClient
        .from("orders")
        .update({
          status: "payment_failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderRecord.id);
    }
    if (inventoryReserved) {
      try {
        await restoreInventoryReservations({
          client: serviceClient,
          reservations: inventoryReservations,
          allowUnlinked: true,
        });
        if (orderRecord?.id) {
          await serviceClient
            .from("orders")
            .update({
              inventory_restored_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", orderRecord.id)
            .is("inventory_restored_at", null);
        }
      } catch (restoreError: any) {
        console.error("[STRIPE_BUY_NOW_TRACE]", "inventory_restore_failed", {
          orderId: orderRecord?.id || null,
          message: restoreError?.message || null,
        });
      }
    }
    if (process.env.NODE_ENV !== "production") {
      console.warn("[STRIPE_BUY_NOW_TRACE]", "create_session_failed", {
        orderId: orderRecord?.id || null,
        orderNumber: orderRecord?.order_number || null,
        listingId: orderItems[0]?.listing_id || null,
        businessId: business.id,
        vendorUserId: business.owner_user_id,
        customerUserId: user.id,
        fulfillmentType,
        checkoutFlow,
        subtotalCents,
        platformFeeAmount,
        totalCents,
        message: error?.message || null,
      });
    }
    return jsonError(
      error?.message || "Failed to create checkout session",
      isStockError(error) ? 409 : 500
    );
  }
}
