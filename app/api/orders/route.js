import { NextResponse } from "next/server";
import { getSupabaseServerClient, getUserCached } from "@/lib/supabaseServer";
import { getPurchaseRestrictionMessage } from "@/lib/auth/purchaseAccess";
import { normalizeStateCode } from "@/lib/location/normalizeStateCode";
import { getCurrentAccountContext } from "@/lib/auth/getCurrentAccountContext";
import { createOrderWithItems } from "@/lib/orders/persistence";

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
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

export async function POST(request) {
  const supabase = await getSupabaseServerClient();
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

  const fees = 0;
  const total = subtotal + fees;

  let orderRecord = null;
  try {
    orderRecord = await createOrderWithItems({
      client: supabase,
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
        subtotal,
        fees,
        total,
      },
      items: items.map((item) => ({
        listing_id: item.listing_id,
        title: item.title,
        unit_price: item.unit_price,
        image_url: item.image_url,
        quantity: item.quantity,
      })),
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
    return jsonError(error?.message || "Failed to create order", 500);
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
