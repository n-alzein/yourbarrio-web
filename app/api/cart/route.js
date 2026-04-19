import { NextResponse } from "next/server";
import { getSupabaseServerClient, getUserCached } from "@/lib/supabaseServer";
import { getPurchaseRestrictionMessage } from "@/lib/auth/purchaseAccess";
import {
  BUSINESS_FULFILLMENT_SELECT,
  DELIVERY_FULFILLMENT_TYPE,
  deriveFulfillmentSummary,
  LISTING_FULFILLMENT_SELECT,
  PICKUP_FULFILLMENT_TYPE,
} from "@/lib/fulfillment";
import { primaryPhotoUrl } from "@/lib/listingPhotos";
import { getCurrentAccountContext } from "@/lib/auth/getCurrentAccountContext";
import {
  clampOrderQuantity,
  getMaxPurchasableQuantity,
  MAX_ORDER_QUANTITY,
  validateOrderQuantity,
} from "@/lib/inventory";

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

async function getBusinessFulfillmentByVendorId(supabase, vendorIds) {
  if (!vendorIds.length) return {};

  const { data, error } = await supabase
    .from("businesses")
    .select(`owner_user_id,${BUSINESS_FULFILLMENT_SELECT}`)
    .in("owner_user_id", vendorIds);

  if (error) throw error;

  return (data || []).reduce((acc, row) => {
    if (row?.owner_user_id) {
      acc[row.owner_user_id] = row;
    }
    return acc;
  }, {});
}

async function getListingFulfillmentById(supabase, listingIds) {
  if (!listingIds.length) return {};

  const { data, error } = await supabase
    .from("listings")
    .select(
      `id,business_id,inventory_status,inventory_quantity,low_stock_threshold,${LISTING_FULFILLMENT_SELECT}`
    )
    .in("id", listingIds);

  if (error) throw error;

  return (data || []).reduce((acc, row) => {
    if (row?.id) {
      acc[row.id] = row;
    }
    return acc;
  }, {});
}

function enrichCartsWithFulfillment(carts, businessByVendorId, listingById) {
  return carts.map((cart) => {
    const cartItems = Array.isArray(cart?.cart_items)
      ? cart.cart_items.map((item) => {
          const listing = listingById[item?.listing_id] || null;
          const maxQuantity = listing ? getMaxPurchasableQuantity(listing) : 0;
          return {
            ...item,
            inventory_status: listing?.inventory_status ?? null,
            inventory_quantity: listing?.inventory_quantity ?? null,
            max_order_quantity: maxQuantity,
            stock_error:
              maxQuantity <= 0
                ? "This item is currently out of stock."
                : Number(item?.quantity || 0) > maxQuantity
                  ? `Only ${maxQuantity} available right now.`
                  : null,
          };
        })
      : [];
    const listings = cartItems
      .map((item) => listingById[item?.listing_id] || null)
      .filter(Boolean);
    const subtotalCents = cartItems.reduce((sum, item) => {
      const unitPrice = Number(item?.unit_price || 0);
      const quantity = Number(item?.quantity || 0);
      return sum + Math.round(unitPrice * 100) * quantity;
    }, 0);
    const summary = deriveFulfillmentSummary({
      listings,
      business: businessByVendorId[cart?.vendor_id] || null,
      subtotalCents,
      currentFulfillmentType: cart?.fulfillment_type || PICKUP_FULFILLMENT_TYPE,
    });

    return {
      ...cart,
      cart_items: cartItems,
      fulfillment_type: summary.selectedFulfillmentType,
      available_fulfillment_methods: summary.availableMethods,
      delivery_fee_cents: summary.deliveryFeeCents,
      delivery_notes: summary.deliveryNotes,
      delivery_min_order_cents: summary.deliveryMinOrderCents,
      delivery_radius_miles: summary.deliveryRadiusMiles,
      delivery_unavailable_reason: summary.deliveryUnavailableReason,
    };
  });
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
  const listingIds = [
    ...new Set(
      carts.flatMap((cart) =>
        Array.isArray(cart?.cart_items)
          ? cart.cart_items.map((item) => item?.listing_id).filter(Boolean)
          : []
      )
    ),
  ];
  const vendors = await getVendorsById(supabase, vendorIds);
  const businesses = await getBusinessFulfillmentByVendorId(supabase, vendorIds);
  const listings = await getListingFulfillmentById(supabase, listingIds);
  return buildCartPayload(enrichCartsWithFulfillment(carts, businesses, listings), vendors);
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
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ORDER_QUANTITY) {
    return jsonError(`Quantity must be between 1 and ${MAX_ORDER_QUANTITY}`, 400);
  }

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select(
      `id,business_id,title,price,photo_url,category,listing_category,category_id,inventory_status,inventory_quantity,low_stock_threshold,${LISTING_FULFILLMENT_SELECT}`
    )
    .eq("id", listingId)
    .maybeSingle();

  if (listingError) {
    return jsonError(listingError.message || "Failed to load listing", 500);
  }
  if (!listing) {
    return jsonError("Listing not found", 404);
  }

  const businessFulfillmentByVendorId = await getBusinessFulfillmentByVendorId(supabase, [
    listing.business_id,
  ]);
  const listingSummary = deriveFulfillmentSummary({
    listings: [listing],
    business: businessFulfillmentByVendorId[listing.business_id] || null,
    subtotalCents: Math.round(Number(listing.price || 0) * 100) * quantity,
    currentFulfillmentType: PICKUP_FULFILLMENT_TYPE,
  });

  if (listingSummary.availableMethods.length === 0) {
    return jsonError("This listing is not available for checkout right now.", 400);
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
        fulfillment_type: listingSummary.selectedFulfillmentType || PICKUP_FULFILLMENT_TYPE,
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

  const nextQuantity = existingItem ? Number(existingItem.quantity || 0) + quantity : quantity;
  const quantityValidation = validateOrderQuantity(nextQuantity, listing);
  if (!quantityValidation.ok) {
    return jsonError(quantityValidation.message, 409, {
      code: quantityValidation.code,
      maxQuantity: quantityValidation.maxQuantity,
    });
  }

  const itemPayload = {
    cart_id: activeCart.id,
    vendor_id: listing.business_id,
    listing_id: listing.id,
    quantity: nextQuantity,
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

    const listingIds = Array.isArray(fulfillmentCart?.cart_items)
      ? fulfillmentCart.cart_items.map((item) => item?.listing_id).filter(Boolean)
      : [];
    const [businessByVendorId, listingById] = await Promise.all([
      getBusinessFulfillmentByVendorId(supabase, fulfillmentCart?.vendor_id ? [fulfillmentCart.vendor_id] : []),
      getListingFulfillmentById(supabase, listingIds),
    ]);
    const summary = deriveFulfillmentSummary({
      listings: listingIds.map((listingId) => listingById[listingId]).filter(Boolean),
      business: businessByVendorId[fulfillmentCart.vendor_id] || null,
      subtotalCents: (fulfillmentCart?.cart_items || []).reduce((sum, item) => {
        const unitPrice = Number(item?.unit_price || 0);
        const itemQuantity = Number(item?.quantity || 0);
        return sum + Math.round(unitPrice * 100) * itemQuantity;
      }, 0),
      currentFulfillmentType: fulfillmentCart.fulfillment_type || PICKUP_FULFILLMENT_TYPE,
    });

    if (!summary.availableMethods.includes(fulfillmentType)) {
      return jsonError(
        summary.deliveryUnavailableReason || "That fulfillment option is not available for this cart.",
        400
      );
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
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_ORDER_QUANTITY) {
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
      const cartItem = activeCarts
        .flatMap((cartRow) => cartRow?.cart_items || [])
        .find((item) => item?.id === itemId);
      if (!cartItem?.listing_id) {
        return jsonError("Cart item not found", 404);
      }

      const { data: listing, error: listingError } = await supabase
        .from("listings")
        .select("id,inventory_status,inventory_quantity,low_stock_threshold")
        .eq("id", cartItem.listing_id)
        .maybeSingle();

      if (listingError) {
        return jsonError(listingError.message || "Failed to load listing", 500);
      }

      const quantityValidation = validateOrderQuantity(quantity, listing);
      if (!quantityValidation.ok) {
        return jsonError(quantityValidation.message, 409, {
          code: quantityValidation.code,
          maxQuantity: quantityValidation.maxQuantity,
          clampedQuantity: clampOrderQuantity(quantity, listing),
        });
      }

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

export async function DELETE(request) {
  const supabase = await getSupabaseServerClient();
  const { user, error: userError } = await getUserCached(supabase);

  if (userError || !user) {
    return jsonError("Unauthorized", 401);
  }

  const purchaseRestrictionError = await getPurchaseRestrictionError({ request, supabase });
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
