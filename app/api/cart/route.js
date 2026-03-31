import { NextResponse } from "next/server";
import { getSupabaseServerClient, getUserCached } from "@/lib/supabaseServer";
import { getPurchaseRestrictionMessage } from "@/lib/auth/purchaseAccess";
import { primaryPhotoUrl } from "@/lib/listingPhotos";
import { getCurrentAccountContext } from "@/lib/auth/getCurrentAccountContext";

async function getActiveCarts(supabase, userId) {
  const { data, error } = await supabase
    .from("carts")
    .select("*, cart_items(*)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function getVendorsById(supabase, vendorIds) {
  if (!vendorIds.length) return {};

  const { data, error } = await supabase
    .from("users")
    .select("id,business_name,full_name,profile_photo_url,city,address")
    .in("id", vendorIds);

  if (error) throw error;

  return (data || []).reduce((acc, vendor) => {
    acc[vendor.id] = vendor;
    return acc;
  }, {});
}

function buildCartPayload(carts, vendorsById) {
  const primaryCart = carts[0] || null;
  const primaryVendor = primaryCart ? vendorsById[primaryCart.vendor_id] || null : null;

  return {
    cart: primaryCart,
    vendor: primaryVendor,
    carts,
    vendors: vendorsById,
  };
}

async function getCartPayload(supabase, userId) {
  const carts = await getActiveCarts(supabase, userId);
  const vendorIds = [...new Set(carts.map((cart) => cart.vendor_id).filter(Boolean))];
  const vendors = await getVendorsById(supabase, vendorIds);
  return buildCartPayload(carts, vendors);
}

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

async function getPurchaseRestrictionError({ request, supabase }) {
  const accountContext = await getCurrentAccountContext({
    request,
    supabase,
    source: "api/cart",
  });
  if (accountContext.canPurchase || !accountContext.isRoleResolved) return null;
  return jsonError(getPurchaseRestrictionMessage(), 403, {
    code: "CUSTOMER_ACCOUNT_REQUIRED",
  });
}

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { user, error: userError } = await getUserCached(supabase);

  if (userError || !user) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const payload = await getCartPayload(supabase, user.id);
    return NextResponse.json(payload || { cart: null, vendor: null, carts: [], vendors: {} }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return jsonError(err?.message || "Failed to load cart", 500);
  }
}

export async function POST(request) {
  const supabase = await getSupabaseServerClient();
  const { user, error: userError } = await getUserCached(supabase);

  if (userError || !user) {
    return jsonError("Unauthorized", 401);
  }

  const purchaseRestrictionError = await getPurchaseRestrictionError({ request, supabase });
  if (purchaseRestrictionError) {
    return purchaseRestrictionError;
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const listingId = body?.listing_id;
  const quantity = Number(body?.quantity || 1);

  if (!listingId) {
    return jsonError("Missing listing_id", 400);
  }
  if (!Number.isFinite(quantity) || quantity < 1) {
    return jsonError("Quantity must be at least 1", 400);
  }

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select(
      "id,business_id,title,price,photo_url,category,category_id,category_info:business_categories(name,slug)"
    )
    .eq("id", listingId)
    .maybeSingle();

  if (listingError) {
    return jsonError(listingError.message || "Failed to load listing", 500);
  }
  if (!listing) {
    return jsonError("Listing not found", 404);
  }

  let cartPayload;
  try {
    cartPayload = await getCartPayload(supabase, user.id);
  } catch (err) {
    return jsonError(err?.message || "Failed to load cart", 500);
  }

  let activeCart =
    (cartPayload?.carts || []).find((cartRow) => cartRow.vendor_id === listing.business_id) || null;

  if (!activeCart) {
    const { data: newCart, error: cartError } = await supabase
      .from("carts")
      .insert({
        user_id: user.id,
        vendor_id: listing.business_id,
        status: "active",
        fulfillment_type: null,
      })
      .select("*")
      .single();

    if (cartError) {
      return jsonError(cartError.message || "Failed to create cart", 500);
    }

    activeCart = newCart;
  }

  const { data: existingItem, error: existingError } = await supabase
    .from("cart_items")
    .select("id,quantity")
    .eq("cart_id", activeCart.id)
    .eq("listing_id", listing.id)
    .maybeSingle();

  if (existingError) {
    return jsonError(existingError.message || "Failed to check cart", 500);
  }

  const itemPayload = {
    cart_id: activeCart.id,
    vendor_id: listing.business_id,
    listing_id: listing.id,
    quantity: existingItem ? existingItem.quantity + quantity : quantity,
    title: listing.title,
    unit_price: listing.price,
    image_url: primaryPhotoUrl(listing.photo_url),
    updated_at: new Date().toISOString(),
  };

  if (existingItem) {
    const { error: updateError } = await supabase
      .from("cart_items")
      .update({ quantity: itemPayload.quantity, updated_at: itemPayload.updated_at })
      .eq("id", existingItem.id);

    if (updateError) {
      return jsonError(updateError.message || "Failed to update cart item", 500);
    }
  } else {
    const { error: insertError } = await supabase
      .from("cart_items")
      .insert(itemPayload);

    if (insertError) {
      return jsonError(insertError.message || "Failed to add cart item", 500);
    }
  }

  try {
    const payload = await getCartPayload(supabase, user.id);
    return NextResponse.json(payload || { cart: null, vendor: null, carts: [], vendors: {} }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return jsonError(err?.message || "Failed to load cart", 500);
  }
}

export async function PATCH(request) {
  const supabase = await getSupabaseServerClient();
  const { user, error: userError } = await getUserCached(supabase);

  if (userError || !user) {
    return jsonError("Unauthorized", 401);
  }

  const purchaseRestrictionError = await getPurchaseRestrictionError(supabase, user.id);
  if (purchaseRestrictionError) {
    return purchaseRestrictionError;
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const itemId = body?.item_id || null;
  const quantity = body?.quantity != null ? Number(body.quantity) : null;
  const hasFulfillmentType = Object.prototype.hasOwnProperty.call(body, "fulfillment_type");
  const fulfillmentType = hasFulfillmentType ? body?.fulfillment_type ?? null : null;
  const cartId = body?.cart_id || null;
  const businessId = body?.business_id || null;

  let cartPayload;
  try {
    cartPayload = await getCartPayload(supabase, user.id);
  } catch (err) {
    return jsonError(err?.message || "Failed to load cart", 500);
  }

  const activeCarts = cartPayload?.carts || [];
  if (!activeCarts.length) {
    return jsonError("Cart not found", 404);
  }

  let fulfillmentCart = null;
  if (hasFulfillmentType) {
    if (cartId) {
      fulfillmentCart = activeCarts.find((cartRow) => cartRow.id === cartId) || null;
    } else if (businessId) {
      fulfillmentCart = activeCarts.find((cartRow) => cartRow.vendor_id === businessId) || null;
    } else if (activeCarts.length === 1) {
      fulfillmentCart = activeCarts[0];
    }

    if (!fulfillmentCart) {
      return jsonError("Cart scope required for fulfillment update", 400);
    }
  }

  if (hasFulfillmentType && fulfillmentType !== fulfillmentCart.fulfillment_type) {
    const { error: updateError } = await supabase
      .from("carts")
      .update({
        fulfillment_type: fulfillmentType,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fulfillmentCart.id);

    if (updateError) {
      return jsonError(updateError.message || "Failed to update cart", 500);
    }
  }

  if (itemId && quantity != null) {
    if (!Number.isFinite(quantity) || quantity < 0) {
      return jsonError("Invalid quantity", 400);
    }

    const activeCartIds = activeCarts.map((cartRow) => cartRow.id);

    if (quantity === 0) {
      const { error: deleteError } = await supabase
        .from("cart_items")
        .delete()
        .eq("id", itemId)
        .in("cart_id", activeCartIds);

      if (deleteError) {
        return jsonError(deleteError.message || "Failed to remove item", 500);
      }
    } else {
      const { error: updateItemError } = await supabase
        .from("cart_items")
        .update({ quantity, updated_at: new Date().toISOString() })
        .eq("id", itemId)
        .in("cart_id", activeCartIds);

      if (updateItemError) {
        return jsonError(updateItemError.message || "Failed to update item", 500);
      }
    }
  }

  try {
    const payload = await getCartPayload(supabase, user.id);
    return NextResponse.json(payload || { cart: null, vendor: null, carts: [], vendors: {} }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return jsonError(err?.message || "Failed to load cart", 500);
  }
}

export async function DELETE() {
  const supabase = await getSupabaseServerClient();
  const { user, error: userError } = await getUserCached(supabase);

  if (userError || !user) {
    return jsonError("Unauthorized", 401);
  }

  const purchaseRestrictionError = await getPurchaseRestrictionError(supabase, user.id);
  if (purchaseRestrictionError) {
    return purchaseRestrictionError;
  }

  let cartPayload;
  try {
    cartPayload = await getCartPayload(supabase, user.id);
  } catch (err) {
    return jsonError(err?.message || "Failed to load cart", 500);
  }

  const activeCarts = cartPayload?.carts || [];
  if (!activeCarts.length) {
    return NextResponse.json({ cart: null, vendor: null, carts: [], vendors: {} }, { status: 200 });
  }

  const cartIds = activeCarts.map((cartRow) => cartRow.id);

  await supabase
    .from("cart_items")
    .delete()
    .in("cart_id", cartIds);

  const { error: updateError } = await supabase
    .from("carts")
    .update({ status: "abandoned", updated_at: new Date().toISOString() })
    .in("id", cartIds);

  if (updateError) {
    return jsonError(updateError.message || "Failed to clear cart", 500);
  }

  return NextResponse.json({ cart: null, vendor: null, carts: [], vendors: {} }, { status: 200 });
}
