import "server-only";

import { MAX_ORDER_QUANTITY } from "@/lib/inventory";

function aggregateListingQuantities(items = []) {
  const totals = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item?.listing_id) continue;
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error("Choose at least 1 item.");
    }
    totals.set(item.listing_id, (totals.get(item.listing_id) || 0) + quantity);
  }
  return totals;
}

function normalizeRpcResult(data) {
  return Array.isArray(data) ? data[0] || null : data || null;
}

export async function reserveInventoryForOrderItems({ client, items }) {
  const totals = aggregateListingQuantities(items);
  if (totals.size === 0) {
    throw new Error("No inventory-tracked items found for reservation.");
  }
  const reservations = [];

  for (const [listingId, quantity] of totals.entries()) {
    if (quantity > MAX_ORDER_QUANTITY) {
      throw new Error(`You can order up to ${MAX_ORDER_QUANTITY} of this item at a time.`);
    }

    const { data, error } = await client.rpc("reserve_listing_inventory", {
      p_listing_id: listingId,
      p_requested_quantity: quantity,
    });

    if (error) {
      throw new Error(error.message || "Could not reserve inventory.");
    }

    const result = normalizeRpcResult(data);
    if (!result?.success) {
      const message =
        result?.message ||
        (result?.error_code === "insufficient_inventory"
          ? "Not enough stock is available for this item."
          : "Could not reserve inventory.");
      throw new Error(message);
    }

    reservations.push({
      inventory_reservation_id: result.reservation_id,
      listing_id: listingId,
      quantity,
      remaining_inventory: result.remaining_inventory ?? null,
    });
  }

  return reservations;
}

export function applyInventoryReservationsToItems(items, reservations) {
  const reservationByListingId = new Map(
    (Array.isArray(reservations) ? reservations : []).map((reservation) => [
      reservation.listing_id,
      reservation,
    ])
  );

  return (Array.isArray(items) ? items : []).map((item) => {
    const reservation = reservationByListingId.get(item?.listing_id);
    if (!reservation) return item;
    return {
      ...item,
      inventory_reservation_id: reservation.inventory_reservation_id,
      reserved_quantity: reservation.quantity,
      inventory_reserved_at: new Date().toISOString(),
    };
  });
}

export async function restoreInventoryReservations({ client, reservations, allowUnlinked = false }) {
  const restored = [];
  const reservationIds = (Array.isArray(reservations) ? reservations : [])
    .map((reservation) => reservation?.inventory_reservation_id || reservation?.id)
    .filter(Boolean);

  if (reservationIds.length === 0) {
    throw new Error("Inventory reservation id is required for restore.");
  }

  for (const reservationId of reservationIds) {
    const { data, error } = await client.rpc("restore_inventory_reservation", {
      p_reservation_id: reservationId,
      p_allow_unlinked: allowUnlinked,
    });

    if (error) {
      throw new Error(error.message || "Could not restore inventory.");
    }

    const result = normalizeRpcResult(data);
    if (!result?.success) {
      throw new Error(result?.message || "Could not restore inventory.");
    }

    restored.push({
      inventory_reservation_id: reservationId,
      listing_id: result.listing_id || null,
      quantity: result.restored_quantity || 0,
      inventory_quantity: result.remaining_inventory ?? null,
      already_restored: Boolean(result.already_restored),
    });
  }

  return restored;
}

export async function restoreInventoryForOrder({ client, orderId }) {
  if (!orderId) {
    throw new Error("Order id is required for inventory restore.");
  }

  const { data: orderItems, error } = await client
    .from("order_items")
    .select("inventory_reservation_id")
    .eq("order_id", orderId);

  if (error) {
    throw new Error(error.message || "Failed to load reserved order items.");
  }

  const reservations = (orderItems || [])
    .map((item) => ({ inventory_reservation_id: item.inventory_reservation_id }))
    .filter((item) => item.inventory_reservation_id);

  if (reservations.length === 0) {
    throw new Error("No inventory reservation found for this order.");
  }

  return restoreInventoryReservations({ client, reservations });
}
