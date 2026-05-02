import { NextResponse } from "next/server";
import {
  getSupabaseServerClient as getAuthedSupabaseServerClient,
  getUserCached,
} from "@/lib/supabaseServer";
import { getSupabaseServerClient as getServiceSupabaseServerClient } from "@/lib/supabase/server";
import { getPurchaseRestrictionMessage } from "@/lib/auth/purchaseAccess";
import {
  BUSINESS_FULFILLMENT_SELECT,
  DELIVERY_FULFILLMENT_TYPE,
  deriveFulfillmentSummary,
  LISTING_FULFILLMENT_SELECT,
  PICKUP_FULFILLMENT_TYPE,
} from "@/lib/fulfillment";
import { resolveListingCoverImageUrl } from "@/lib/listingPhotos";
import { getCurrentAccountContext } from "@/lib/auth/getCurrentAccountContext";
import { MAX_ORDER_QUANTITY } from "@/lib/inventory";
import { getVariantInventoryListing } from "@/lib/listingOptions";
import { assertListingPurchasable, isSeededListing } from "@/lib/seededListings";
import {
  buildOnlyLeftAvailableMessage,
  getInventoryAvailabilitySnapshot,
  releaseCartItemReservation,
  upsertCartItemReservation,
} from "@/lib/cart/reservations";

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function getServiceClientOrFallback(fallbackClient) {
  try {
    return getServiceSupabaseServerClient() ?? fallbackClient;
  } catch {
    return fallbackClient;
  }
}

function isMissingAuthSessionError(error) {
  if (!error) return false;
  const code = String(error?.code || "").toLowerCase();
  const name = String(error?.name || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "auth_session_missing" ||
    name === "authsessionmissingerror" ||
    message.includes("auth session missing") ||
    message.includes("session missing")
  );
}

function shouldAllowGuestRequestWithoutSession({ user, userError, guestId }) {
  return Boolean(guestId && !user?.id && isMissingAuthSessionError(userError));
}

async function getActiveCarts(client, { userId = null, guestId = null } = {}) {
  if (!userId && !guestId) return [];

  const query = client
    .from("carts")
    .select("*, cart_items(*)")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (userId) {
    query.eq("user_id", userId);
  } else {
    query.eq("guest_id", guestId).is("user_id", null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function getVendorsById(client, vendorIds) {
  if (!vendorIds.length) return {};

  const { data, error } = await client
    .from("users")
    .select("id,business_name,full_name,profile_photo_url,city,address")
    .in("id", vendorIds);

  if (error) throw error;

  return (data || []).reduce((acc, vendor) => {
    acc[vendor.id] = vendor;
    return acc;
  }, {});
}

async function getBusinessFulfillmentByVendorId(client, vendorIds) {
  if (!vendorIds.length) return {};

  const { data, error } = await client
    .from("businesses")
    .select(`owner_user_id,${BUSINESS_FULFILLMENT_SELECT}`)
    .in("owner_user_id", vendorIds);

  if (error) throw error;

  return (data || []).reduce((acc, row) => {
    if (row?.owner_user_id) acc[row.owner_user_id] = row;
    return acc;
  }, {});
}

async function getListingFulfillmentById(client, listingIds) {
  if (!listingIds.length) return {};

  const { data, error } = await client
    .from("listings")
    .select(
      `id,business_id,title,price,photo_url,photo_variants,cover_image_id,inventory_status,inventory_quantity,low_stock_threshold,is_seeded,${LISTING_FULFILLMENT_SELECT}`
    )
    .in("id", listingIds);

  if (error) throw error;

  return (data || []).reduce((acc, row) => {
    if (row?.id) acc[row.id] = row;
    return acc;
  }, {});
}

async function getVariantsById(client, variantIds) {
  if (!variantIds.length) return {};

  const { data, error } = await client
    .from("listing_variants")
    .select("id,listing_id,price,quantity,is_active")
    .in("id", variantIds);

  if (error) throw error;

  return (data || []).reduce((acc, row) => {
    if (row?.id) acc[row.id] = row;
    return acc;
  }, {});
}

async function getPurchaseRestrictionError({ request, supabase, user }) {
  if (!user?.id) return null;
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

async function getOrCreateActiveCart(
  client,
  { userId = null, guestId = null, vendorId, fulfillmentType = PICKUP_FULFILLMENT_TYPE }
) {
  const query = client
    .from("carts")
    .select("*")
    .eq("vendor_id", vendorId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (userId) {
    query.eq("user_id", userId);
  } else {
    query.eq("guest_id", guestId).is("user_id", null);
  }

  const { data: existingCart, error: existingError } = await query;
  if (existingError) throw existingError;
  if (existingCart?.id) return existingCart;

  const insertPayload = {
    user_id: userId,
    guest_id: userId ? null : guestId,
    vendor_id: vendorId,
    status: "active",
    fulfillment_type: fulfillmentType,
  };

  const { data: cart, error: insertError } = await client
    .from("carts")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertError) throw insertError;
  return cart;
}

async function enrichCartsWithFulfillment(carts, serviceClient, businessByVendorId, listingById, variantById) {
  const enriched = [];

  for (const cart of carts) {
    const cartItems = [];
    for (const item of Array.isArray(cart?.cart_items) ? cart.cart_items : []) {
      const listing = listingById[item?.listing_id] || null;
      const variant = item?.variant_id ? variantById[item.variant_id] || null : null;
      const purchasableListing = variant ? getVariantInventoryListing(listing, variant) : listing;
      const availability = await getInventoryAvailabilitySnapshot({
        client: serviceClient,
        listingId: item?.listing_id,
        variantId: item?.variant_id || null,
        excludeCartItemIds: item?.id ? [item.id] : [],
      });
      const reservationExpired =
        item?.reservation_expires_at && Date.parse(item.reservation_expires_at) <= Date.now();
      const maxQuantity = Math.max(
        0,
        Math.min(MAX_ORDER_QUANTITY, Number(availability.availableQuantity || 0))
      );

      let stockError = null;
      if (isSeededListing(purchasableListing)) {
        stockError = "This preview item is not available for purchase yet.";
      } else if (reservationExpired) {
        stockError = "Your cart reservation expired.";
      } else if (!listing || (item?.variant_id && !variant)) {
        stockError = "This item is currently unavailable.";
      } else if (Number(item?.quantity || 0) > maxQuantity) {
        stockError = buildOnlyLeftAvailableMessage(maxQuantity);
      }

      cartItems.push({
        ...item,
        inventory_status: purchasableListing?.inventory_status ?? null,
        inventory_quantity: purchasableListing?.inventory_quantity ?? null,
        max_order_quantity: maxQuantity,
        reserved_quantity: Number(item?.reserved_quantity || item?.quantity || 0),
        reservation_expires_at: item?.reservation_expires_at || null,
        stock_error: stockError,
      });
    }

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

    enriched.push({
      ...cart,
      cart_items: cartItems,
      fulfillment_type: summary.selectedFulfillmentType,
      available_fulfillment_methods: summary.availableMethods,
      delivery_fee_cents: summary.deliveryFeeCents,
      delivery_notes: summary.deliveryNotes,
      delivery_min_order_cents: summary.deliveryMinOrderCents,
      delivery_radius_miles: summary.deliveryRadiusMiles,
      delivery_unavailable_reason: summary.deliveryUnavailableReason,
    });
  }

  return enriched;
}

function buildCartPayload(carts, vendorsById, guestId = null) {
  const primaryCart = carts[0] || null;
  const primaryVendor = primaryCart ? vendorsById[primaryCart.vendor_id] || null : null;

  return {
    guest_id: guestId,
    cart: primaryCart,
    vendor: primaryVendor,
    carts,
    vendors: vendorsById,
  };
}

async function getCartPayload(serviceClient, { userId = null, guestId = null } = {}) {
  const carts = await getActiveCarts(serviceClient, { userId, guestId });
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
  const variantIds = [
    ...new Set(
      carts.flatMap((cart) =>
        Array.isArray(cart?.cart_items)
          ? cart.cart_items.map((item) => item?.variant_id).filter(Boolean)
          : []
      )
    ),
  ];

  const vendors = await getVendorsById(serviceClient, vendorIds);
  const businesses = await getBusinessFulfillmentByVendorId(serviceClient, vendorIds);
  const listings = await getListingFulfillmentById(serviceClient, listingIds);
  const variants = await getVariantsById(serviceClient, variantIds);
  const enrichedCarts = await enrichCartsWithFulfillment(carts, serviceClient, businesses, listings, variants);

  return buildCartPayload(enrichedCarts, vendors, guestId);
}

async function loadListingForCartAdd(client, listingId, variantId) {
  const { data: listing, error: listingError } = await client
    .from("listings")
    .select(
      `id,business_id,title,price,photo_url,photo_variants,cover_image_id,inventory_status,inventory_quantity,low_stock_threshold,is_seeded,${LISTING_FULFILLMENT_SELECT}`
    )
    .eq("id", listingId)
    .maybeSingle();

  if (listingError) throw listingError;
  if (!listing?.id) return { listing: null, variant: null, firstActiveVariant: null };

  const { data: firstActiveVariant } = await client
    .from("listing_variants")
    .select("id")
    .eq("listing_id", listing.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  let activeVariant = null;
  if (variantId) {
    const { data: variant, error: variantError } = await client
      .from("listing_variants")
      .select("id,listing_id,price,quantity,is_active")
      .eq("id", variantId)
      .maybeSingle();

    if (variantError) throw variantError;
    activeVariant = variant;
  }

  return { listing, variant: activeVariant, firstActiveVariant };
}

async function transferGuestItemToUserCart({
  client,
  guestItemId,
  guestId,
  guestCartId = null,
  targetCart,
  targetItemId = null,
}) {
  const logSkippedGuestItem = (reason, extra = {}) => {
    console.warn("[cart] skipped guest cart item during merge", {
      reason,
      guest_id: guestId,
      guest_cart_id: guestCartId,
      guest_item_id: guestItemId,
      target_cart_id: targetCart?.id || null,
      ...extra,
    });
  };

  const { data: guestItem, error: guestItemError } = await client
    .from("cart_items")
    .select("id,cart_id,vendor_id,listing_id,variant_id,variant_label,selected_options,quantity,title,unit_price,image_url")
    .eq("id", guestItemId)
    .maybeSingle();

  if (guestItemError) throw guestItemError;
  if (!guestItem?.id) {
    logSkippedGuestItem("guest_cart_item_not_found");
    return { mode: "skipped", guestItem: null, excludeCartItemIds: [] };
  }

  const { data: guestCart, error: guestCartError } = await client
    .from("carts")
    .select("id,guest_id,status,vendor_id")
    .eq("id", guestItem.cart_id)
    .maybeSingle();

  if (guestCartError) throw guestCartError;
  if (!guestCart?.id || guestCart.guest_id !== guestId || guestCart.status !== "active") {
    logSkippedGuestItem("guest_cart_item_not_found", {
      guest_cart_id: guestCart?.id || guestItem.cart_id || guestCartId,
      item_cart_id: guestItem.cart_id,
      listing_id: guestItem.listing_id,
      variant_id: guestItem.variant_id,
      cart_status: guestCart?.status || null,
    });
    return { mode: "skipped", guestItem, excludeCartItemIds: [] };
  }

  if (targetItemId) {
    return {
      mode: "merge",
      guestItem,
      excludeCartItemIds: [guestItem.id],
    };
  }

  const nextExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const { error: updateError } = await client
    .from("cart_items")
    .update({
      cart_id: targetCart.id,
      vendor_id: targetCart.vendor_id,
      reservation_expires_at: nextExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("id", guestItem.id);

  if (updateError) throw updateError;

  return {
    mode: "moved",
    guestItem,
    excludeCartItemIds: [],
  };
}

export async function GET(request) {
  const supabase = await getAuthedSupabaseServerClient();
  const serviceClient = getServiceClientOrFallback(supabase);
  const { user, error: userError } = await getUserCached(supabase);
  const { searchParams } = new URL(request.url);
  const guestId = String(searchParams.get("guest_id") || "").trim() || null;

  if (userError && !shouldAllowGuestRequestWithoutSession({ user, userError, guestId })) {
    return jsonError("Unauthorized", 401);
  }

  if (!user?.id && !guestId) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const payload = await getCartPayload(serviceClient, {
      userId: user?.id || null,
      guestId: user?.id ? null : guestId,
    });
    return NextResponse.json(payload || { cart: null, vendor: null, carts: [], vendors: {} }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return jsonError(err?.message || "Failed to load cart", 500);
  }
}

export async function POST(request) {
  const supabase = await getAuthedSupabaseServerClient();
  const serviceClient = getServiceClientOrFallback(supabase);
  const { user, error: userError } = await getUserCached(supabase);

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const guestId = String(body?.guest_id || "").trim() || null;
  if (
    (userError && !shouldAllowGuestRequestWithoutSession({ user, userError, guestId })) ||
    (!user?.id && !guestId)
  ) {
    return jsonError("Unauthorized", 401);
  }

  const purchaseRestrictionError = await getPurchaseRestrictionError({ request, supabase, user });
  if (purchaseRestrictionError) return purchaseRestrictionError;

  const listingId = body?.listing_id;
  const variantId = body?.variant_id || null;
  const variantLabel = body?.variant_label || null;
  const selectedOptions =
    body?.selected_options && typeof body.selected_options === "object" ? body.selected_options : {};
  const quantity = Number(body?.quantity || 1);
  const transferGuestItemId = String(body?.guest_item_id || "").trim() || null;
  const transferGuestCartId = String(body?.guest_cart_id || "").trim() || null;

  if (!listingId) return jsonError("Missing listing_id", 400);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ORDER_QUANTITY) {
    return jsonError(`Quantity must be between 1 and ${MAX_ORDER_QUANTITY}`, 400);
  }

  try {
    const { listing, variant, firstActiveVariant } = await loadListingForCartAdd(serviceClient, listingId, variantId);
    if (!listing) return jsonError("Listing not found", 404);
    if (variantId && (!variant?.id || variant.listing_id !== listing.id || variant.is_active === false)) {
      return jsonError("Select a valid product option before adding this item to your cart.", 400);
    }
    if (!variantId && firstActiveVariant?.id) {
      return jsonError("Select a product option before adding this item to your cart.", 400);
    }

    const businessFulfillmentByVendorId = await getBusinessFulfillmentByVendorId(serviceClient, [
      listing.business_id,
    ]);
    const purchasableListing = variant ? getVariantInventoryListing(listing, variant) : listing;
    try {
      assertListingPurchasable(purchasableListing);
    } catch (error) {
      return jsonError(error?.message || "This preview item is not available for purchase yet.", 400, {
        code: error?.code || "SEEDED_LISTING_NOT_PURCHASABLE",
      });
    }

    const selectedUnitPrice =
      variant?.price !== null && variant?.price !== undefined
        ? Number(variant.price)
        : Number(listing.price || 0);
    const listingSummary = deriveFulfillmentSummary({
      listings: [purchasableListing],
      business: businessFulfillmentByVendorId[listing.business_id] || null,
      subtotalCents: Math.round(selectedUnitPrice * 100) * quantity,
      currentFulfillmentType: PICKUP_FULFILLMENT_TYPE,
    });

    if (listingSummary.availableMethods.length === 0) {
      return jsonError("This listing is not available for checkout right now.", 400);
    }

    const activeCart = await getOrCreateActiveCart(serviceClient, {
      userId: user?.id || null,
      guestId: user?.id ? null : guestId,
      vendorId: listing.business_id,
      fulfillmentType: listingSummary.selectedFulfillmentType || PICKUP_FULFILLMENT_TYPE,
    });

    const existingItemQuery = serviceClient
      .from("cart_items")
      .select("id,quantity")
      .eq("cart_id", activeCart.id)
      .eq("listing_id", listing.id);

    if (variant?.id) {
      existingItemQuery.eq("variant_id", variant.id);
    } else {
      existingItemQuery.is("variant_id", null);
    }

    const { data: existingItem, error: existingError } = await existingItemQuery.maybeSingle();
    if (existingError) throw existingError;

    let excludeCartItemIds = [];
    if (transferGuestItemId && user?.id && guestId) {
      const transferResult = await transferGuestItemToUserCart({
        client: serviceClient,
        guestItemId: transferGuestItemId,
        guestId,
        guestCartId: transferGuestCartId,
        targetCart: activeCart,
        targetItemId: existingItem?.id || null,
      });
      if (transferResult.mode === "skipped") {
        const payload = await getCartPayload(serviceClient, { userId: user.id });
        return NextResponse.json(payload || { cart: null, vendor: null, carts: [], vendors: {} }, {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        });
      }
      if (transferResult.mode === "moved") {
        const payload = await getCartPayload(serviceClient, { userId: user.id });
        return NextResponse.json(payload, { status: 200, headers: { "Cache-Control": "no-store" } });
      }
      excludeCartItemIds = transferResult.excludeCartItemIds;
    }

    const nextQuantity = Number(existingItem?.quantity || 0) + quantity;
    const reservationResult = await upsertCartItemReservation({
      client: serviceClient,
      cartId: activeCart.id,
      userId: user?.id || null,
      guestId: user?.id ? null : guestId,
      listingId: listing.id,
      variantId: variant?.id || null,
      variantLabel,
      selectedOptions,
      title: listing.title,
      unitPrice: selectedUnitPrice,
      imageUrl: resolveListingCoverImageUrl(listing),
      quantity: nextQuantity,
      cartItemId: existingItem?.id || null,
      excludeCartItemIds,
    });

    if (!reservationResult.success) {
      return jsonError(reservationResult.message, 409, {
        code: reservationResult.errorCode,
        maxQuantity: reservationResult.availableQuantity,
      });
    }

    if (transferGuestItemId && user?.id && guestId && existingItem?.id) {
      await releaseCartItemReservation({
        client: serviceClient,
        cartItemId: transferGuestItemId,
        guestId,
      });
    }

    const payload = await getCartPayload(serviceClient, {
      userId: user?.id || null,
      guestId: user?.id ? null : guestId,
    });
    return NextResponse.json(payload || { cart: null, vendor: null, carts: [], vendors: {} }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return jsonError(err?.message || "Failed to add to cart", 500);
  }
}

export async function PATCH(request) {
  const supabase = await getAuthedSupabaseServerClient();
  const serviceClient = getServiceClientOrFallback(supabase);
  const { user, error: userError } = await getUserCached(supabase);

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const guestId = String(body?.guest_id || "").trim() || null;
  if (
    (userError && !shouldAllowGuestRequestWithoutSession({ user, userError, guestId })) ||
    (!user?.id && !guestId)
  ) {
    return jsonError("Unauthorized", 401);
  }

  const purchaseRestrictionError = await getPurchaseRestrictionError({ request, supabase, user });
  if (purchaseRestrictionError) return purchaseRestrictionError;

  const itemId = body?.item_id || null;
  const quantity = body?.quantity != null ? Number(body.quantity) : null;
  const hasFulfillmentType = Object.prototype.hasOwnProperty.call(body, "fulfillment_type");
  const fulfillmentType = hasFulfillmentType ? body?.fulfillment_type ?? null : null;
  const cartId = body?.cart_id || null;
  const businessId = body?.business_id || null;

  let cartPayload;
  try {
    cartPayload = await getCartPayload(serviceClient, {
      userId: user?.id || null,
      guestId: user?.id ? null : guestId,
    });
  } catch (err) {
    return jsonError(err?.message || "Failed to load cart", 500);
  }

  const activeCarts = cartPayload?.carts || [];
  if (!activeCarts.length) return jsonError("Cart not found", 404);

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
      getBusinessFulfillmentByVendorId(
        serviceClient,
        fulfillmentCart?.vendor_id ? [fulfillmentCart.vendor_id] : []
      ),
      getListingFulfillmentById(serviceClient, listingIds),
    ]);
    const summary = deriveFulfillmentSummary({
      listings: listingIds.map((listingRowId) => listingById[listingRowId]).filter(Boolean),
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

    if (fulfillmentType !== fulfillmentCart.fulfillment_type) {
      const { error: updateError } = await serviceClient
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
  }

  if (itemId && quantity != null) {
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_ORDER_QUANTITY) {
      return jsonError("Invalid quantity", 400);
    }

    const cartItem = activeCarts
      .flatMap((cartRow) => cartRow?.cart_items || [])
      .find((item) => item?.id === itemId);
    if (!cartItem?.listing_id) {
      return jsonError("Cart item not found", 404);
    }

    if (quantity === 0) {
      try {
        await releaseCartItemReservation({
          client: serviceClient,
          cartItemId: itemId,
          userId: user?.id || null,
          guestId: user?.id ? null : guestId,
        });
      } catch (err) {
        return jsonError(err?.message || "Failed to remove item", 500);
      }
    } else {
      const reservationResult = await upsertCartItemReservation({
        client: serviceClient,
        cartId: cartItem.cart_id,
        userId: user?.id || null,
        guestId: user?.id ? null : guestId,
        listingId: cartItem.listing_id,
        variantId: cartItem.variant_id || null,
        variantLabel: cartItem.variant_label || null,
        selectedOptions: cartItem.selected_options || {},
        title: cartItem.title,
        unitPrice: cartItem.unit_price,
        imageUrl: cartItem.image_url,
        quantity,
        cartItemId: cartItem.id,
      });

      if (!reservationResult.success) {
        return jsonError(reservationResult.message, 409, {
          code: reservationResult.errorCode,
          maxQuantity: reservationResult.availableQuantity,
        });
      }
    }
  }

  try {
    const payload = await getCartPayload(serviceClient, {
      userId: user?.id || null,
      guestId: user?.id ? null : guestId,
    });
    return NextResponse.json(payload || { cart: null, vendor: null, carts: [], vendors: {} }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return jsonError(err?.message || "Failed to load cart", 500);
  }
}

export async function DELETE(request) {
  const supabase = await getAuthedSupabaseServerClient();
  const serviceClient = getServiceClientOrFallback(supabase);
  const { user, error: userError } = await getUserCached(supabase);
  const { searchParams } = new URL(request.url);
  const guestId = String(searchParams.get("guest_id") || "").trim() || null;

  if (
    (userError && !shouldAllowGuestRequestWithoutSession({ user, userError, guestId })) ||
    (!user?.id && !guestId)
  ) {
    return jsonError("Unauthorized", 401);
  }

  const purchaseRestrictionError = await getPurchaseRestrictionError({ request, supabase, user });
  if (purchaseRestrictionError) return purchaseRestrictionError;

  let cartPayload;
  try {
    cartPayload = await getCartPayload(serviceClient, {
      userId: user?.id || null,
      guestId: user?.id ? null : guestId,
    });
  } catch (err) {
    return jsonError(err?.message || "Failed to load cart", 500);
  }

  const activeCarts = cartPayload?.carts || [];
  if (!activeCarts.length) {
    return NextResponse.json({ cart: null, vendor: null, carts: [], vendors: {}, guest_id: guestId }, { status: 200 });
  }

  const cartIds = activeCarts.map((cartRow) => cartRow.id);
  const { error: deleteError } = await serviceClient.from("cart_items").delete().in("cart_id", cartIds);
  if (deleteError) {
    return jsonError(deleteError.message || "Failed to clear cart", 500);
  }

  const { error: updateError } = await serviceClient
    .from("carts")
    .update({ status: "abandoned", updated_at: new Date().toISOString() })
    .in("id", cartIds);

  if (updateError) {
    return jsonError(updateError.message || "Failed to clear cart", 500);
  }

  return NextResponse.json(
    { cart: null, vendor: null, carts: [], vendors: {}, guest_id: guestId },
    { status: 200 }
  );
}
