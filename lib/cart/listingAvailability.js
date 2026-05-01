export const DEFAULT_LISTING_AVAILABILITY_KEY = "__default__";

export function getListingAvailabilityKey(variantId = null) {
  return variantId ? `variant:${variantId}` : DEFAULT_LISTING_AVAILABILITY_KEY;
}

function normalizeIdentifier(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function matchesListingSelection(
  item,
  { listingId, variantId = null, includeAllVariants = false }
) {
  if (!item || normalizeIdentifier(item.listing_id) !== normalizeIdentifier(listingId)) {
    return false;
  }

  if (variantId) {
    return normalizeIdentifier(item.variant_id) === normalizeIdentifier(variantId);
  }

  if (includeAllVariants) {
    return true;
  }

  return !normalizeIdentifier(item.variant_id);
}

export function getCartItemsForListingSelection({
  cartItems = [],
  listingId,
  variantId = null,
  includeAllVariants = false,
}) {
  return Array.isArray(cartItems)
    ? cartItems.filter((item) =>
        matchesListingSelection(item, { listingId, variantId, includeAllVariants })
      )
    : [];
}

export function getQuantityInCartForListingSelection({
  cartItems = [],
  listingId,
  variantId = null,
  includeAllVariants = false,
}) {
  return getCartItemsForListingSelection({
    cartItems,
    listingId,
    variantId,
    includeAllVariants,
  }).reduce((sum, item) => sum + Math.max(0, Number(item?.quantity || 0)), 0);
}

export function getCartItemIdsForListingSelection({
  cartItems = [],
  listingId,
  variantId = null,
  includeAllVariants = false,
}) {
  return getCartItemsForListingSelection({
    cartItems,
    listingId,
    variantId,
    includeAllVariants,
  })
    .map((item) => normalizeIdentifier(item?.id))
    .filter(Boolean);
}

export function clampListingQuantitySelection(quantity, selectableQuantityCap) {
  const normalizedCap = Math.max(0, Number(selectableQuantityCap || 0));
  if (normalizedCap <= 0) return 0;

  const normalizedQuantity = Number(quantity);
  if (!Number.isFinite(normalizedQuantity)) return 1;

  return Math.max(1, Math.min(normalizedCap, Math.round(normalizedQuantity)));
}

export function resolveListingQuantityState({
  inventoryMaxQuantity,
  selectedQuantity,
  serverAvailableQuantity = null,
  quantityInCart = 0,
}) {
  const normalizedInventoryMax = Math.max(0, Number(inventoryMaxQuantity || 0));
  const normalizedQuantityInCart = Math.max(0, Number(quantityInCart || 0));
  const hasKnownServerAvailability =
    serverAvailableQuantity !== null &&
    serverAvailableQuantity !== undefined &&
    Number.isFinite(Number(serverAvailableQuantity));
  const normalizedServerAvailable = hasKnownServerAvailability
    ? Math.max(0, Number(serverAvailableQuantity || 0))
    : null;
  const remainingAvailableToAdd =
    normalizedServerAvailable === null
      ? null
      : Math.max(0, normalizedServerAvailable - normalizedQuantityInCart);
  const selectableQuantityCap =
    remainingAvailableToAdd === null
      ? normalizedInventoryMax
      : Math.min(normalizedInventoryMax, remainingAvailableToAdd);
  const clampedQuantity = clampListingQuantitySelection(selectedQuantity, selectableQuantityCap);

  return {
    hasKnownServerAvailability,
    quantityInCart: normalizedQuantityInCart,
    remainingAvailableToAdd,
    selectableQuantityCap,
    clampedQuantity,
    isCurrentlyUnavailable: selectableQuantityCap <= 0,
    allAvailableUnitsAlreadyInCart:
      hasKnownServerAvailability &&
      normalizedQuantityInCart > 0 &&
      remainingAvailableToAdd !== null &&
      remainingAvailableToAdd <= 0,
  };
}

export function getListingAvailabilityMessage({
  inventoryMaxQuantity,
  serverAvailableQuantity = null,
  quantityInCart = 0,
}) {
  if (
    serverAvailableQuantity === null ||
    serverAvailableQuantity === undefined ||
    !Number.isFinite(Number(serverAvailableQuantity))
  ) {
    return "";
  }

  const normalizedInventoryMax = Math.max(0, Number(inventoryMaxQuantity || 0));
  const normalizedQuantityInCart = Math.max(0, Number(quantityInCart || 0));
  const normalizedServerAvailable = Math.max(0, Number(serverAvailableQuantity || 0));
  const normalizedRemainingAvailable = Math.max(
    0,
    Math.min(normalizedInventoryMax, normalizedServerAvailable - normalizedQuantityInCart)
  );

  if (normalizedRemainingAvailable <= 0) {
    if (normalizedQuantityInCart > 0) {
      return "All available units are already in your cart.";
    }
    return "Currently unavailable.";
  }

  if (normalizedRemainingAvailable >= normalizedInventoryMax) {
    return "";
  }

  return `Only ${normalizedRemainingAvailable} left available.`;
}
