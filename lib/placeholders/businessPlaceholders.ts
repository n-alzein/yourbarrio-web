import { resolveImageSrc } from "@/lib/safeImage";

export const BUSINESS_PLACEHOLDER_BASE = "/placeholders/business/types";
export const GENERIC_BUSINESS_PLACEHOLDER = `${BUSINESS_PLACEHOLDER_BASE}/other.png`;

const BUSINESS_TYPE_TO_FILE: Record<string, string> = {
  boutique: `${BUSINESS_PLACEHOLDER_BASE}/boutique.png`,
  "beauty-wellness": `${BUSINESS_PLACEHOLDER_BASE}/beauty-wellness.png`,
  bookstore: `${BUSINESS_PLACEHOLDER_BASE}/bookstore.png`,
  automotive: `${BUSINESS_PLACEHOLDER_BASE}/automotive.png`,
  "arts-crafts": `${BUSINESS_PLACEHOLDER_BASE}/arts-crafts.png`,
  fitness: `${BUSINESS_PLACEHOLDER_BASE}/fitness.png`,
  "tech-shop": `${BUSINESS_PLACEHOLDER_BASE}/tech-shop.png`,
  "kids-family": `${BUSINESS_PLACEHOLDER_BASE}/kids-family.png`,
  jewelry: `${BUSINESS_PLACEHOLDER_BASE}/jewelry.png`,
  "pet-shop": `${BUSINESS_PLACEHOLDER_BASE}/pet-shop.png`,
  "florist-plants": `${BUSINESS_PLACEHOLDER_BASE}/florist-plants.png`,
  "handmade-artisan": `${BUSINESS_PLACEHOLDER_BASE}/handmade-artisan.png`,
  // TODO: remove legacy category compatibility after all business rows are normalized.
  "grocery-specialty-foods": `${BUSINESS_PLACEHOLDER_BASE}/grocery-specialty-foods.png`,
  "home-services": `${BUSINESS_PLACEHOLDER_BASE}/home-services.png`,
  "food-drink": `${BUSINESS_PLACEHOLDER_BASE}/food-drink.png`,
  "furniture-decor": `${BUSINESS_PLACEHOLDER_BASE}/furniture-decor.png`,
  other: `${BUSINESS_PLACEHOLDER_BASE}/other.png`,
  "home-goods": `${BUSINESS_PLACEHOLDER_BASE}/home-goods.png`,
  "professional-services": `${BUSINESS_PLACEHOLDER_BASE}/professional-services.png`,
  "specialty-retail": `${BUSINESS_PLACEHOLDER_BASE}/specialty-retail.png`,
  "gift-shop": `${BUSINESS_PLACEHOLDER_BASE}/gift-shop.png`,
  "thrift-vintage": `${BUSINESS_PLACEHOLDER_BASE}/thrift-vintage.png`,
  "travel-hospitality": `${BUSINESS_PLACEHOLDER_BASE}/travel-hospitality.png`,
};

const LEGACY_BUSINESS_TYPE_MAP: Record<string, string> = {
  "thrift & vintage": "thrift-vintage",
  "gift shop": "gift-shop",
  "home goods": "home-goods",
  "professional services": "professional-services",
  "flowers & plants": "florist-plants",
  florist: "florist-plants",
  "arts & crafts": "arts-crafts",
  "beauty & wellness": "beauty-wellness",
  "kids & family": "kids-family",
  "tech shop": "tech-shop",
  "food & drink": "food-drink",
  "home services": "home-services",
  "specialty retail": "specialty-retail",
  "travel & hospitality": "travel-hospitality",
  "handmade & artisan": "handmade-artisan",
  "furniture & decor": "furniture-decor",
  "grocery & specialty foods": "grocery-specialty-foods",
};

function toTrimmedString(value?: string | null): string | null {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

export function normalizeBusinessTypeSlug(value?: string | null): string | null {
  const trimmed = toTrimmedString(value);
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();
  const legacyMapped = LEGACY_BUSINESS_TYPE_MAP[lowered];
  if (legacyMapped) return legacyMapped;

  return lowered
    .replace(/&/g, "and")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getBusinessTypePlaceholder(businessType?: string | null): string {
  const normalized = normalizeBusinessTypeSlug(businessType);
  if (!normalized) return GENERIC_BUSINESS_PLACEHOLDER;
  return BUSINESS_TYPE_TO_FILE[normalized] || GENERIC_BUSINESS_PLACEHOLDER;
}

export type ResolveBusinessImageInput = {
  imageUrl?: string | null;
  businessType?: string | null;
  legacyCategory?: string | null;
};

export function resolveBusinessImageSrc(input: ResolveBusinessImageInput = {}): string {
  const placeholder = getBusinessTypePlaceholder(
    input.businessType || input.legacyCategory || null
  );
  const primary = toTrimmedString(input.imageUrl);
  if (primary) {
    return resolveImageSrc(primary, placeholder);
  }

  return placeholder || GENERIC_BUSINESS_PLACEHOLDER;
}
