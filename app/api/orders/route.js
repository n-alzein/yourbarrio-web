import { NextResponse } from "next/server";
import { getSupabaseServerClient, getUserCached } from "@/lib/supabaseServer";
import { getPurchaseRestrictionMessage } from "@/lib/auth/purchaseAccess";
import {
  BUSINESS_FULFILLMENT_SELECT,
  DELIVERY_FULFILLMENT_TYPE,
  deriveFulfillmentSummary,
  LISTING_FULFILLMENT_SELECT,
} from "@/lib/fulfillment";
import { normalizeStateCode } from "@/lib/location/normalizeStateCode";
import { getCurrentAccountContext } from "@/lib/auth/getCurrentAccountContext";
import { createOrderWithItems } from "@/lib/orders/persistence";
import {
  commitOrderInventoryFromCartReservations,
  revalidateCartReservationsForCheckout,
} from "@/lib/cart/reservations";
import { getSupabaseServerClient as getSupabaseServiceClient } from "@/lib/supabase/server";
import { MAX_ORDER_QUANTITY, validateOrderQuantity } from "@/lib/inventory";
import { getVariantInventoryListing } from "@/lib/listingOptions";
import { assertListingPurchasable } from "@/lib/seededListings";

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function getServiceClientOrFallback(fallbackClient) {
  try {
    return getSupabaseServiceClient() ?? fallbackClient;
  } catch {
    return fallbackClient;
  }
}

function isStockError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("stock") ||
    message.includes("available") ||
    message.includes("order up to") ||
    message.includes("at least 1")
  );
}

async function getActiveCart(supabase, userId, { cartId, businessId } = {}) {
  const query = supabase
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

  if (error) throw error;
  return data || null;
}

async function getListingVariantsByIds(client, variantIds) {
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

export async function POST(request) {
  const supabase = await getSupabaseServerClient();
  const serviceClient = getServiceClientOrFallback(supabase);
  const { user, error: userError } = await getUserCached(supabase);
  const diagEnabled = process.env.NODE_ENV !== "production";

  if (userError || !user) {
    return jsonError("Unauthorized", 401);
  }

  const accountContext = await getCurrentAccountContext({
    request,
    supabase,
    source: "api/orders",
  });
  if (!accountContext.canPurchase && accountContext.isRoleResolved) {
    return jsonError(getPurchaseRestrictionMessage(), 403, {
      code: "CUSTOMER_ACCOUNT_REQUIRED",
    });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const cartId = body?.cart_id || null;
  const businessId = body?.business_id || null;
  const contactName = (body?.contact_name || "").trim();
  const contactPhone = (body?.contact_phone || "").trim();
  const contactEmail = (body?.contact_email || "").trim() || null;
  const deliveryAddress1 = (body?.delivery_address1 || "").trim() || null;
  const deliveryAddress2 = (body?.delivery_address2 || "").trim() || null;
  const deliveryCity = (body?.delivery_city || "").trim() || null;
  const deliveryState = normalizeStateCode(body?.delivery_state) || null;
  const deliveryPostal = (body?.delivery_postal_code || "").trim() || null;
  const deliveryInstructions = (body?.delivery_instructions || "").trim() || null;
  const deliveryTime = (body?.delivery_time || "").trim() || null;
  const pickupTime = (body?.pickup_time || "").trim() || null;

  if (!contactName || !contactPhone) {
    return jsonError("Missing contact details", 400);
  }

  let activeCart;
  try {
    activeCart = await getActiveCart(supabase, user.id, { cartId, businessId });
  } catch (err) {
    return jsonError(err?.message || "Failed to load cart", 500);
  }

  if (!activeCart) {
    return jsonError("Cart not found", 404);
  }
  if (businessId && activeCart.vendor_id !== businessId) {
    return jsonError("Cart business mismatch", 400);
  }

  const items = Array.isArray(activeCart.cart_items)
    ? activeCart.cart_items
    : [];

  if (!items.length) {
    return jsonError("Cart is empty", 400);
  }

  const fulfillmentType = body?.fulfillment_type ?? activeCart.fulfillment_type ?? null;
  if (!fulfillmentType) {
    return jsonError("Missing fulfillment type", 400);
  }

  if (fulfillmentType === "delivery" && !deliveryAddress1) {
    return jsonError("Delivery address required", 400);
  }

  const subtotal = items.reduce((sum, item) => {
    const unitPrice = Number(item.unit_price || 0);
    const qty = Number(item.quantity || 0);
    return sum + unitPrice * qty;
  }, 0);

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select(`owner_user_id,${BUSINESS_FULFILLMENT_SELECT}`)
    .eq("owner_user_id", activeCart.vendor_id)
    .maybeSingle();

  if (businessError) {
    return jsonError(businessError.message || "Failed to load business fulfillment", 500);
  }

  const listingIds = items.map((item) => item?.listing_id).filter(Boolean);
  const { data: listingRows, error: listingRowsError } = await serviceClient
    .from("listings")
    .select(`id,business_id,inventory_status,inventory_quantity,low_stock_threshold,is_seeded,${LISTING_FULFILLMENT_SELECT}`)
    .in("id", listingIds);

  if (listingRowsError) {
    return jsonError(listingRowsError.message || "Failed to load listing fulfillment", 500);
  }

  const fulfillmentSummary = deriveFulfillmentSummary({
    listings: Array.isArray(listingRows) ? listingRows : [],
    business,
    subtotalCents: Math.round(subtotal * 100),
    currentFulfillmentType: fulfillmentType,
  });

  if (!fulfillmentSummary.availableMethods.includes(fulfillmentType)) {
    return jsonError(
      fulfillmentSummary.deliveryUnavailableReason ||
        "That fulfillment option is not available for this order.",
      400
    );
  }

  const listingsById = new Map((Array.isArray(listingRows) ? listingRows : []).map((row) => [row.id, row]));
  const variantsById = await getListingVariantsByIds(
    serviceClient,
    items.map((item) => item?.variant_id).filter(Boolean)
  );
  let orderItems = items.map((item) => ({
    listing_id: item.listing_id,
    variant_id: item.variant_id || null,
    variant_label: item.variant_label || null,
    selected_options: item.selected_options || null,
    title: item.title,
    unit_price: item.unit_price,
    image_url: item.image_url,
    quantity: Number(item.quantity || 0),
  }));

  for (const item of orderItems) {
    const listing = listingsById.get(item.listing_id);
    const variant = item.variant_id ? variantsById.get(item.variant_id) : null;
    if (item.variant_id && (!variant || variant.is_active === false)) {
      return jsonError("A selected product option is no longer available.", 409);
    }
    try {
      assertListingPurchasable(
        variant ? getVariantInventoryListing(listing, variant) : listing
      );
    } catch (error) {
      return jsonError(error?.message || "This preview item is not available for purchase yet.", 400, {
        code: error?.code || "SEEDED_LISTING_NOT_PURCHASABLE",
      });
    }
    const validation = validateOrderQuantity(
      item.quantity,
      variant ? getVariantInventoryListing(listing, variant) : listing
    );
    if (!validation.ok) {
      return jsonError(validation.message, 409, {
        code: validation.code,
        maxQuantity: validation.maxQuantity,
      });
    }
    if (item.quantity > MAX_ORDER_QUANTITY) {
      return jsonError(`You can order up to ${MAX_ORDER_QUANTITY} of each item at a time.`, 409);
    }
  }

  const fees = 0;
  const deliveryFee = fulfillmentType === DELIVERY_FULFILLMENT_TYPE
    ? fulfillmentSummary.deliveryFeeCents / 100
    : 0;
  const total = subtotal + deliveryFee + fees;

  let orderRecord = null;
  try {
    const cartReservationCheck = await revalidateCartReservationsForCheckout({
      client: serviceClient,
      cartItems: items,
      userId: user.id,
    });
    if (!cartReservationCheck.ok) {
      return jsonError("Some cart reservations changed before checkout.", 409, {
        code: "CART_RESERVATION_INVALID",
        issues: cartReservationCheck.issues,
      });
    }

    orderItems = cartReservationCheck.items.map((item) => ({
      listing_id: item.listing_id,
      variant_id: item.variant_id || null,
      variant_label: item.variant_label || null,
      selected_options: item.selected_options || null,
      title: item.title,
      unit_price: item.unit_price,
      image_url: item.image_url,
      quantity: Number(item.quantity || 0),
      cart_item_id: item.id,
      inventory_reserved_at: item.inventory_reserved_at,
      reserved_quantity: item.reserved_quantity,
    }));

    orderRecord = await createOrderWithItems({
      client: serviceClient,
      logPrefix: "[STRIPE_CART_TRACE]",
      order: {
        user_id: user.id,
        vendor_id: activeCart.vendor_id,
        cart_id: activeCart.id,
        status: "requested",
        fulfillment_type: fulfillmentType,
        contact_name: contactName,
        contact_phone: contactPhone,
        contact_email: contactEmail,
        delivery_address1: deliveryAddress1,
        delivery_address2: deliveryAddress2,
        delivery_city: deliveryCity,
        delivery_state: deliveryState,
        delivery_postal_code: deliveryPostal,
        delivery_instructions: deliveryInstructions,
        delivery_time: fulfillmentType === "delivery" ? deliveryTime : null,
        pickup_time: fulfillmentType === "pickup" ? pickupTime : null,
        delivery_fee_cents_snapshot:
          fulfillmentType === DELIVERY_FULFILLMENT_TYPE
            ? fulfillmentSummary.deliveryFeeCents
            : 0,
        delivery_notes_snapshot:
          fulfillmentType === DELIVERY_FULFILLMENT_TYPE
            ? fulfillmentSummary.deliveryNotes
            : null,
        subtotal,
        fees,
        total,
        inventory_reserved_at: new Date().toISOString(),
      },
      items: orderItems,
    });

    await commitOrderInventoryFromCartReservations({
      client: serviceClient,
      orderId: orderRecord.id,
      userId: user.id,
    });
  } catch (error) {
    if (diagEnabled) {
      console.warn("[STRIPE_CART_TRACE]", "create_order_failed", {
        userId: user.id,
        cartId: activeCart?.id || null,
        vendorId: activeCart?.vendor_id || null,
        businessIdParam: businessId,
        listingIds: items.map((item) => item.listing_id).filter(Boolean),
        message: error?.message || null,
      });
    }
    return jsonError(error?.message || "Failed to create order", isStockError(error) ? 409 : 500);
  }

  if (diagEnabled) {
    console.warn("[STRIPE_CART_TRACE]", "create_order_success", {
      orderId: orderRecord.id,
      orderNumber: orderRecord.order_number,
      customerUserId: user.id,
      activeCartId: activeCart.id,
      activeCartVendorId: activeCart.vendor_id,
      insertedOrderVendorId: orderRecord.vendor_id || null,
      businessIdParam: businessId,
      listingIds: items.map((item) => item.listing_id).filter(Boolean),
    });
  }

  await supabase
    .from("carts")
    .update({ status: "submitted", updated_at: new Date().toISOString() })
    .eq("id", activeCart.id);

  return NextResponse.json({ order_number: orderRecord.order_number }, { status: 200 });
}
