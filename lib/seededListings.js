export const SEEDED_LISTING_BADGE_LABEL = "Coming soon";
export const SEEDED_LISTING_PREVIEW_MESSAGE =
  "This preview item is not available for purchase yet.";

export function isSeededBusiness(business) {
  return business?.is_seeded === true;
}

export function isSeededListing(listing, options = {}) {
  if (!listing && !options?.business) return false;
  return (
    listing?.is_seeded === true ||
    listing?.business_is_seeded === true ||
    isSeededBusiness(options?.business)
  );
}

export function assertListingPurchasable(listing, options = {}) {
  if (isSeededListing(listing, options)) {
    const error = new Error(SEEDED_LISTING_PREVIEW_MESSAGE);
    error.code = "SEEDED_LISTING_NOT_PURCHASABLE";
    throw error;
  }
  return listing;
}

export function getSeededListingBadgeLabel(listing, options = {}) {
  return isSeededListing(listing, options) ? SEEDED_LISTING_BADGE_LABEL : null;
}
