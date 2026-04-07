import { NextResponse } from "next/server";
import { getCurrentAccountContext } from "@/lib/auth/getCurrentAccountContext";
import { getPurchaseRestrictionMessage } from "@/lib/auth/purchaseAccess";
import { getListingUrl } from "@/lib/ids/publicRefs";
import { isUuid } from "@/lib/ids/isUuid";
import { createOrderWithItems } from "@/lib/orders/persistence";
import { STRIPE_PENDING_ORDER_STATUS } from "@/lib/orders/marketplace";
import { getAppUrl, getStripe, calculatePlatformFeeAmount, dollarsToCents } from "@/lib/stripe";
import { getStripeModeFromSecretKey, getStripeSecretKey } from "@/lib/stripe/env";
import { getBusinessStripeStatus } from "@/lib/stripe/status";
import { getSupabaseServerClient as getServiceClient } from "@/lib/supabase/server";
import { getSupabaseServerClient, getUserCached } from "@/lib/supabaseServer";
import { normalizeStateCode } from "@/lib/location/normalizeStateCode";

function jsonError(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
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
  const quantity = Math.max(1, Math.min(25, Number(body?.quantity || 1) || 1));
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
    title: string;
    unit_price: number;
    image_url: string | null;
    quantity: number;
  }> = [];
  let subtotalCents = 0;
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
        "id,public_id,title,price,photo_url,business_id,inventory_status,inventory_quantity"
      )
      .eq("id", listingId)
      .maybeSingle();

    if (listingError) {
      return jsonError(listingError.message || "Failed to load listing", 500);
    }
    if (!listing?.id) {
      return jsonError("Listing not found", 404);
    }

    if (String(listing.inventory_status || "").trim() === "out_of_stock") {
      return jsonError("This item is currently out of stock", 400);
    }

    const unitAmount = dollarsToCents(Number(listing.price || 0));
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
        title: listing.title,
        unit_price: Number(listing.price || 0),
        image_url: listing.photo_url || null,
        quantity,
      },
    ];
    subtotalCents = unitAmount * quantity;
    cancelPath = getListingUrl(listing);
    orderInput = {
      ...orderInput,
      vendor_id: business.owner_user_id,
      subtotal: subtotalCents / 100,
      total: subtotalCents / 100,
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
      quantity: Math.max(1, Number(item?.quantity || 1)),
    }));
    subtotalCents = orderItems.reduce((sum, item) => {
      const unitAmount = dollarsToCents(item.unit_price);
      return sum + unitAmount * item.quantity;
    }, 0);

    if (subtotalCents <= 0) {
      return jsonError("Your cart is not available for Stripe checkout yet", 400);
    }

    cancelPath = businessData.owner_user_id
      ? `/checkout?business_id=${encodeURIComponent(businessData.owner_user_id)}`
      : "/checkout";
    orderInput = {
      ...orderInput,
      vendor_id: business.owner_user_id,
      cart_id: activeCart.id,
      subtotal: subtotalCents / 100,
      total: subtotalCents / 100,
    };
  }

  if (!business?.id) {
    return jsonError("Business not found", 404);
  }

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
  const platformFeeAmount = calculatePlatformFeeAmount(subtotalCents);
  const total = subtotalCents / 100;
  let orderRecord:
    | { id: string; order_number: string; status?: string | null; vendor_id?: string | null; user_id?: string | null }
    | null = null;

  try {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[STRIPE_BUY_NOW_TRACE]", "create_session_start", {
        listingId: orderItems[0]?.listing_id || null,
        businessId: business.id,
        vendorUserId: business.owner_user_id,
        customerUserId: user.id,
        quantity: orderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        fulfillmentType,
        subtotalCents,
        platformFeeAmount,
      });
    }

    orderRecord = await createOrderWithItems({
      client: serviceClient,
      logPrefix: "[STRIPE_BUY_NOW_TRACE]",
      order: {
        ...orderInput,
        platform_fee_amount: platformFeeAmount,
      },
      items: orderItems,
    });

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
      })),
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
      });
    }

    return NextResponse.json(
      {
        url: session.url,
        orderId: orderRecord.id,
        orderNumber: orderRecord.order_number,
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
    if (process.env.NODE_ENV !== "production") {
      console.warn("[STRIPE_BUY_NOW_TRACE]", "create_session_failed", {
        orderId: orderRecord?.id || null,
        orderNumber: orderRecord?.order_number || null,
        listingId: orderItems[0]?.listing_id || null,
        businessId: business.id,
        vendorUserId: business.owner_user_id,
        customerUserId: user.id,
        fulfillmentType,
        message: error?.message || null,
      });
    }
    return jsonError(error?.message || "Failed to create checkout session", 500);
  }
}
