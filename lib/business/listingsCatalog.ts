import { calculateListingPricing } from "@/lib/pricing";
import { getListingCategoryLabel } from "@/lib/taxonomy/compat";

export const BUSINESS_LISTINGS_VIEW_STORAGE_KEY = "yb_business_listings_view";
export const BUSINESS_LISTINGS_VIEW_GRID = "grid";
export const BUSINESS_LISTINGS_VIEW_TABLE = "table";

export type BusinessListingsView =
  | typeof BUSINESS_LISTINGS_VIEW_GRID
  | typeof BUSINESS_LISTINGS_VIEW_TABLE;

export type BusinessListingsSortKey = "updated" | "name" | "price" | "stock";
export type BusinessListingsStatusFilter = "all" | "live" | "draft" | "out_of_stock";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function uppercaseDisplay(value: string) {
  return value.toUpperCase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asPriceLike(value: unknown): number | string | null | undefined {
  return typeof value === "number" || typeof value === "string" ? value : null;
}

export function getListingRef(listing: Record<string, unknown> | null | undefined) {
  const candidates = [
    cleanString(listing?.public_id),
    cleanString(listing?.short_id),
    cleanString(listing?.listing_number),
    cleanString(listing?.reference_id),
    cleanString(listing?.listing_ref),
  ].filter(Boolean);

  const safeRef = candidates.find((value) => !isUuidLike(value) && value.length <= 24);
  return safeRef ? uppercaseDisplay(safeRef) : null;
}

export function getListingSku(listing: Record<string, unknown> | null | undefined) {
  const directSku = cleanString(listing?.sku);
  if (directSku) return uppercaseDisplay(directSku);

  const listingOptions = asRecord(listing?.listingOptions);
  const variants = Array.isArray(listingOptions?.variants)
    ? listingOptions.variants
    : Array.isArray(listing?.variants)
      ? listing.variants
      : [];

  const firstSku = variants
    .map((variant: Record<string, unknown>) => cleanString(variant?.sku))
    .find(Boolean);

  return firstSku ? uppercaseDisplay(firstSku) : null;
}

export function getListingStock(listing: Record<string, unknown> | null | undefined) {
  const quantity = Number(listing?.inventory_quantity);
  return Number.isFinite(quantity) ? quantity : null;
}

export function getListingStatus(listing: Record<string, unknown> | null | undefined) {
  const status = cleanString(listing?.status).toLowerCase();
  const stock = getListingStock(listing);
  const hasUnpublishedChanges = listing?.has_unpublished_changes === true;

  if (stock === 0) {
    return {
      key: "out_of_stock",
      label: "Out of stock",
    };
  }

  if (status === "draft") {
    return {
      key: "draft",
      label: "Draft",
    };
  }

  if (hasUnpublishedChanges) {
    return {
      key: "live",
      label: "Changes not published",
    };
  }

  return {
    key: "live",
    label: "Live",
  };
}

export function getCustomerFacingPrice(listing: Record<string, unknown> | null | undefined) {
  const pricing = calculateListingPricing(asPriceLike(listing?.price));
  if (!(pricing.finalPriceCents > pricing.basePriceCents)) {
    return null;
  }
  const explicitFinalPriceCents = Number(listing?.finalPriceCents);
  return Number.isFinite(explicitFinalPriceCents) && explicitFinalPriceCents > 0
    ? explicitFinalPriceCents
    : pricing.finalPriceCents;
}

export function getListingCategoryFilterValue(listing: Record<string, unknown> | null | undefined) {
  return getListingCategoryLabel(listing, "Uncategorized");
}

export function getListingUpdatedAt(listing: Record<string, unknown> | null | undefined) {
  const candidates = [
    cleanString(listing?.updated_at),
    cleanString(listing?.inventory_last_updated_at),
    cleanString(listing?.created_at),
  ].filter(Boolean);

  const firstDate = candidates
    .map((value) => {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : null;
    })
    .find((value) => value !== null);

  return firstDate ?? 0;
}

export function getListingSearchText(listing: Record<string, unknown> | null | undefined) {
  return [
    cleanString(listing?.title),
    cleanString(getListingRef(listing)),
    cleanString(getListingSku(listing)),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterAndSortListings(
  listings: Record<string, unknown>[],
  {
    search = "",
    status = "all",
    category = "all",
    sort = "updated",
  }: {
    search?: string;
    status?: BusinessListingsStatusFilter;
    category?: string;
    sort?: BusinessListingsSortKey;
  } = {}
) {
  const normalizedSearch = cleanString(search).toLowerCase();

  const filtered = (Array.isArray(listings) ? listings : []).filter((listing) => {
    const listingStatus = getListingStatus(listing);
    const listingCategory = getListingCategoryFilterValue(listing);
    const matchesSearch =
      !normalizedSearch || getListingSearchText(listing).includes(normalizedSearch);
    const matchesStatus = status === "all" || listingStatus.key === status;
    const matchesCategory = category === "all" || listingCategory === category;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  const sorted = [...filtered].sort((left, right) => {
    if (sort === "name") {
      return cleanString(left?.title).localeCompare(cleanString(right?.title));
    }

    if (sort === "price") {
      return Number(right?.price || 0) - Number(left?.price || 0);
    }

    if (sort === "stock") {
      return Number(getListingStock(right) ?? -1) - Number(getListingStock(left) ?? -1);
    }

    return getListingUpdatedAt(right) - getListingUpdatedAt(left);
  });

  return sorted;
}
