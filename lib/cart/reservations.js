import "server-only";

function normalizeRpcResult(data) {
  return Array.isArray(data) ? data[0] || null : data || null;
}

export function buildOnlyLeftAvailableMessage(quantity) {
  return `Only ${Math.max(0, Number(quantity || 0))} left available.`;
}

export async function getInventoryAvailabilitySnapshot({
  client,
  listingId,
  variantId = null,
  excludeCartItemIds = [],
}) {
  const { data, error } = await client.rpc("get_inventory_availability", {
    p_listing_id: listingId,
    p_variant_id: variantId,
    p_exclude_cart_item_ids: excludeCartItemIds,
  });

  if (error) {
    throw new Error(error.message || "Failed to load inventory availability.");
  }

  const result = normalizeRpcResult(data) || {};
  return {
    stockQuantity: Number(result.stock_quantity || 0),
    activeCartReservations: Number(result.active_cart_reservations || 0),
    committedOrderQuantity: Number(result.committed_order_quantity || 0),
    availableQuantity: Math.max(0, Number(result.available_quantity || 0)),
  };
}

export async function upsertCartItemReservation({
  client,
  cartId,
  userId = null,
  guestId = null,
  listingId,
  variantId = null,
  variantLabel = null,
  selectedOptions = {},
  title = null,
  unitPrice = null,
  imageUrl = null,
  quantity,
  cartItemId = null,
  excludeCartItemIds = [],
}) {
  const { data, error } = await client.rpc("upsert_cart_item_reservation", {
    p_cart_id: cartId,
    p_user_id: userId,
    p_guest_id: guestId,
    p_listing_id: listingId,
    p_variant_id: variantId,
    p_variant_label: variantLabel,
    p_selected_options: selectedOptions || {},
    p_title: title,
    p_unit_price: unitPrice,
    p_image_url: imageUrl,
    p_quantity: quantity,
    p_cart_item_id: cartItemId,
    p_exclude_cart_item_ids: excludeCartItemIds,
  });

  if (error) {
    throw new Error(error.message || "Failed to reserve cart inventory.");
  }

  const result = normalizeRpcResult(data);
  if (!result?.success) {
    const availableQuantity = Math.max(0, Number(result?.available_quantity || 0));
    const message =
      result?.message ||
      (result?.error_code === "insufficient_inventory"
        ? buildOnlyLeftAvailableMessage(availableQuantity)
        : "Failed to reserve cart inventory.");
    const failure = {
      success: false,
      cartItemId: result?.cart_item_id || null,
      reservationExpiresAt: result?.reservation_expires_at || null,
      availableQuantity,
      errorCode: result?.error_code || "reservation_failed",
      message,
    };
    return failure;
  }

  const success = {
    success: true,
    cartItemId: result.cart_item_id,
    reservationExpiresAt: result.reservation_expires_at,
    availableQuantity: Math.max(0, Number(result.available_quantity || 0)),
    errorCode: null,
    message: null,
  };
  return success;
}

export async function releaseCartItemReservation({
  client,
  cartItemId,
  userId = null,
  guestId = null,
}) {
  const { data, error } = await client.rpc("release_cart_item_reservation", {
    p_cart_item_id: cartItemId,
    p_user_id: userId,
    p_guest_id: guestId,
  });

  if (error) {
    throw new Error(error.message || "Failed to release cart reservation.");
  }

  const result = normalizeRpcResult(data);
  if (!result?.success) {
    throw new Error(result?.message || "Failed to release cart reservation.");
  }

  return result;
}

export async function commitOrderInventoryFromCartReservations({
  client,
  orderId,
  userId = null,
}) {
  const { data, error } = await client.rpc("commit_order_inventory_from_cart_reservations", {
    p_order_id: orderId,
    p_user_id: userId,
  });

  if (error) {
    throw new Error(error.message || "Failed to commit order inventory.");
  }

  const result = normalizeRpcResult(data);
  if (!result?.success) {
    throw new Error(result?.message || "Failed to commit order inventory.");
  }
  return {
    alreadyCommitted: Boolean(result?.already_committed),
  };
}

export async function revalidateCartReservationsForCheckout({
  client,
  cartItems,
  userId = null,
  guestId = null,
}) {
  const issues = [];
  const refreshedItems = [];

  for (const item of Array.isArray(cartItems) ? cartItems : []) {
    const expiresAt = item?.reservation_expires_at ? Date.parse(item.reservation_expires_at) : NaN;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      issues.push({
        itemId: item?.id || null,
        listingId: item?.listing_id || null,
        variantId: item?.variant_id || null,
        title: item?.title || "Cart item",
        reason: "Reservation expired.",
        code: "RESERVATION_EXPIRED",
      });
      continue;
    }

    const result = await upsertCartItemReservation({
      client,
      cartId: item.cart_id,
      userId,
      guestId,
      listingId: item.listing_id,
      variantId: item.variant_id || null,
      variantLabel: item.variant_label || null,
      selectedOptions: item.selected_options || {},
      title: item.title,
      unitPrice: item.unit_price,
      imageUrl: item.image_url,
      quantity: Number(item.quantity || 0),
      cartItemId: item.id,
    });

    if (!result.success) {
      issues.push({
        itemId: item?.id || null,
        listingId: item?.listing_id || null,
        variantId: item?.variant_id || null,
        title: item?.title || "Cart item",
        reason: result.message || "Inventory is no longer available.",
        code: result.errorCode || "RESERVATION_INVALID",
        availableQuantity: result.availableQuantity,
      });
      continue;
    }

    refreshedItems.push({
      ...item,
      cart_item_id: item.id,
      reserved_quantity: Number(item.quantity || 0),
      inventory_reserved_at: new Date().toISOString(),
      reservation_expires_at: result.reservationExpiresAt,
    });
  }

  return {
    ok: issues.length === 0,
    issues,
    items: refreshedItems,
  };
}
