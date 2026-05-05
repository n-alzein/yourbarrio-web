import {
  getBusinessType,
  inferBusinessTypeFromLegacyCategory,
  normalizeBusinessTypeSlug,
} from "@/lib/taxonomy/businessTypes";
import {
  getListingCategory,
  resolveListingCategoryValue,
} from "@/lib/taxonomy/listingCategories";

function trimValue(value) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

export function resolveBusinessType(input) {
  const record = input && typeof input === "object" ? input : null;
  const directValue = record ? record.business_type : input;
  const directMatch = getBusinessType(directValue);
  if (directMatch) {
    return {
      slug: directMatch.slug,
      label: directMatch.label,
      source: "business_type",
    };
  }

  const legacyValue = record?.category;
  const legacyMatch = inferBusinessTypeFromLegacyCategory(legacyValue);
  if (legacyMatch) {
    return {
      slug: legacyMatch.slug,
      label: legacyMatch.label,
      source: "legacy_category",
    };
  }

  const raw = trimValue(directValue) || trimValue(legacyValue);
  if (!raw) return null;

  return {
    slug: normalizeBusinessTypeSlug(raw),
    label: raw,
    source: legacyValue ? "legacy_category" : "business_type",
  };
}

export function getBusinessTypeLabel(input, fallback = "Local business") {
  return resolveBusinessType(input)?.label || fallback;
}

export function getBusinessTypeSlug(input, fallback = "other") {
  return resolveBusinessType(input)?.slug || fallback;
}

export function buildBusinessTaxonomyPayload(input = {}) {
  const resolved = resolveBusinessType(input);
  return {
    business_type_id: trimValue(input.business_type_id),
    business_type: resolved?.slug || null,
    category: resolved?.label || trimValue(input.category),
    businessTypeSlug: resolved?.slug || null,
    businessTypeName: resolved?.label || trimValue(input.category),
  };
}

export function resolveListingCategory(input) {
  const record = input && typeof input === "object" ? input : null;
  const directValue = record ? record.listing_category : input;
  const directMatch = getListingCategory(directValue);
  if (directMatch) {
    return {
      slug: directMatch.slug,
      label: directMatch.label,
      source: "listing_category",
    };
  }

  const legacyValue = trimValue(record?.category);
  const legacyMatch = getListingCategory(legacyValue);
  if (legacyMatch) {
    return {
      slug: legacyMatch.slug,
      label: legacyMatch.label,
      source: "legacy_category",
    };
  }

  const raw = trimValue(directValue) || legacyValue;
  const fallback = resolveListingCategoryValue(raw, { fallbackToOther: Boolean(raw) });
  if (!fallback) return null;

  return {
    slug: fallback.slug,
    label: fallback.label,
    source: raw === legacyValue ? "legacy_category_fallback" : "listing_category_fallback",
  };
}

export function getListingCategoryLabel(input, fallback = "Listing") {
  return resolveListingCategory(input)?.label || fallback;
}

export function getListingCategorySlug(input, fallback = "listing") {
  return resolveListingCategory(input)?.slug || fallback;
}

export function buildListingTaxonomyPayload(input = {}) {
  const resolved = resolveListingCategory(input);
  return {
    listing_category_id: trimValue(input.listing_category_id),
    listing_category: resolved?.label || null,
    category: resolved?.slug || null,
    listing_subcategory: trimValue(input.listing_subcategory),
    listingCategorySlug: resolved?.slug || null,
    listingCategoryName: resolved?.label || null,
  };
}
