import { isSeededListing } from "@/lib/seededListings";

const DEFAULT_LOW_STOCK_THRESHOLD = 5;
export const MAX_ORDER_QUANTITY = 5;

export function getLowStockThreshold(listing) {
  const raw = listing?.low_stock_threshold;
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return DEFAULT_LOW_STOCK_THRESHOLD;
}

export function normalizeInventory(listing) {
  if (isSeededListing(listing)) {
    return { availability: "preview", label: "Coming soon", statusKey: "seeded_preview" };
  }

  const statusKey = listing?.inventory_status || "in_stock";
  const quantityRaw = listing?.inventory_quantity;
  const quantity = quantityRaw === null || quantityRaw === undefined
    ? null
    : Number(quantityRaw);
  const threshold = getLowStockThreshold(listing);

  if (statusKey === "out_of_stock") {
    return { availability: "out", label: "Out of stock", statusKey };
  }

  if (quantity === null || Number.isNaN(quantity)) {
    return { availability: "out", label: "Unavailable", statusKey };
  }

  if (quantity <= 0) {
    return { availability: "out", label: "Out of stock", statusKey };
  }

  if (statusKey === "always_available" || statusKey === "seasonal") {
    return { availability: "available", label: "In stock", statusKey };
  }

  if (statusKey === "low_stock") {
    return { availability: "low", label: "Low stock", statusKey };
  }

  if (quantity <= threshold) {
    return { availability: "low", label: "Low stock", statusKey };
  }

  return { availability: "available", label: "Available", statusKey };
}

export function getAvailableInventoryQuantity(listing) {
  if (isSeededListing(listing)) return 0;
  const statusKey = String(listing?.inventory_status || "in_stock").trim();
  if (statusKey === "out_of_stock") return 0;

  const quantityRaw = listing?.inventory_quantity;
  if (quantityRaw === null || quantityRaw === undefined || quantityRaw === "") {
    // YourBarrio checkout treats NULL inventory as not tracked and not sellable.
    // Listings need a concrete inventory_quantity before the reservation RPC can sell them.
    return null;
  }

  const quantity = Number(quantityRaw);
  if (!Number.isFinite(quantity)) return null;
  return Math.max(0, Math.floor(quantity));
}

export function getMaxPurchasableQuantity(listing) {
  const available = getAvailableInventoryQuantity(listing);
  if (available === null) return 0;
  return Math.max(0, Math.min(MAX_ORDER_QUANTITY, available));
}

export function clampOrderQuantity(quantity, listing) {
  const parsed = Number(quantity);
  const requested = Number.isFinite(parsed) ? Math.round(parsed) : 1;
  const maxQuantity = getMaxPurchasableQuantity(listing);
  if (maxQuantity <= 0) return 0;
  return Math.max(1, Math.min(maxQuantity, requested));
}

export function validateOrderQuantity(quantity, listing) {
  const parsed = Number(quantity);
  if (!Number.isFinite(parsed) || Math.round(parsed) !== parsed || parsed < 1) {
    return {
      ok: false,
      code: "INVALID_QUANTITY",
      message: "Choose at least 1 item.",
      maxQuantity: getMaxPurchasableQuantity(listing),
    };
  }

  if (parsed > MAX_ORDER_QUANTITY) {
    return {
      ok: false,
      code: "MAX_QUANTITY_EXCEEDED",
      message: `You can order up to ${MAX_ORDER_QUANTITY} of this item at a time.`,
      maxQuantity: getMaxPurchasableQuantity(listing),
    };
  }

  const maxQuantity = getMaxPurchasableQuantity(listing);
  if (maxQuantity <= 0) {
    return {
      ok: false,
      code: "OUT_OF_STOCK",
      message: "This item is currently out of stock.",
      maxQuantity,
    };
  }

  if (parsed > maxQuantity) {
    return {
      ok: false,
      code: "INSUFFICIENT_STOCK",
      message: `Only ${maxQuantity} available right now.`,
      maxQuantity,
    };
  }

  return {
    ok: true,
    quantity: parsed,
    maxQuantity,
  };
}

export function sortListingsByAvailability(listings) {
  if (!Array.isArray(listings)) return [];
  const rank = { available: 0, low: 1, out: 2 };
  rank.preview = 1;

  return listings
    .map((item, index) => {
      const availability = normalizeInventory(item).availability;
      return {
        item,
        index,
        rank: rank[availability] ?? 0,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item);
}

export const AVAILABILITY_BADGE_PALETTE = {
  available: {
    light: { color: "#065f46", border: "#047857" },
    dark: { color: "#d1fae5", border: "rgba(110, 231, 183, 0.7)" },
  },
  low: {
    light: { color: "#92400e", border: "#b45309" },
    dark: { color: "#fef3c7", border: "rgba(252, 211, 77, 0.7)" },
  },
  out: {
    light: { color: "#9f1239", border: "#be123c" },
    dark: { color: "#ffe4e6", border: "rgba(251, 113, 133, 0.7)" },
  },
  preview: {
    light: { color: "#5b5f6b", border: "rgba(148, 163, 184, 0.72)" },
    dark: { color: "#e2e8f0", border: "rgba(148, 163, 184, 0.7)" },
  },
};

export function getAvailabilityBadgeStyle(availability, isLight) {
  const key =
    typeof availability === "string" ? availability : availability?.availability || null;
  const palette = key ? AVAILABILITY_BADGE_PALETTE[key] : null;
  if (!palette) return null;
  return isLight ? palette.light : palette.dark;
}
