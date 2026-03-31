import { NextResponse } from "next/server";
import { getSupabaseServerClient, getUserCached } from "@/lib/supabaseServer";
import { getPurchaseRestrictionMessage } from "@/lib/auth/purchaseAccess";
import { normalizeStateCode } from "@/lib/location/normalizeStateCode";
import { getCurrentAccountContext } from "@/lib/auth/getCurrentAccountContext";

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function buildOrderNumber() {
  const fragment = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `YB-${fragment}`;
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
  let orderNumber = null;
  let lastError = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = buildOrderNumber();
    const { data, error } = await supabase
      .from("orders")
      .insert({
        order_number: candidate,
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
      })
      .select("id,order_number")
      .single();

    if (!error) {
      orderRecord = data;
      orderNumber = candidate;
      break;
    }

    if (error?.code !== "23505") {
      lastError = error;
      break;
    }
  }

  if (!orderRecord) {
    return jsonError(lastError?.message || "Failed to create order", 500);
  }

  const orderItems = items.map((item) => ({
    order_id: orderRecord.id,
    listing_id: item.listing_id,
    title: item.title,
    unit_price: item.unit_price,
    image_url: item.image_url,
    quantity: item.quantity,
  }));

  const { error: itemsError } = await supabase
    .from("order_items")
    .insert(orderItems);

  if (itemsError) {
    return jsonError(itemsError.message || "Failed to save order items", 500);
  }

  await supabase
    .from("carts")
    .update({ status: "submitted", updated_at: new Date().toISOString() })
    .eq("id", activeCart.id);

  return NextResponse.json({ order_number: orderNumber }, { status: 200 });
}
