const BUSINESS_TYPE_DEFINITIONS = [
  { slug: "boutique", label: "Boutique" },
  { slug: "thrift-vintage", label: "Thrift & Vintage" },
  { slug: "gift-shop", label: "Gift Shop" },
  { slug: "home-goods", label: "Home Goods" },
  { slug: "furniture-decor", label: "Furniture & Decor" },
  { slug: "beauty-wellness", label: "Beauty & Wellness" },
  { slug: "food-drink", label: "Food & Drink" },
  { slug: "grocery-specialty-foods", label: "Grocery & Specialty Foods" },
  { slug: "florist-plants", label: "Florist & Plants" },
  { slug: "pet-shop", label: "Pet Shop" },
  { slug: "bookstore", label: "Bookstore" },
  { slug: "jewelry", label: "Jewelry" },
  { slug: "kids-family", label: "Kids & Family" },
  { slug: "tech-shop", label: "Tech Shop" },
  { slug: "automotive", label: "Automotive" },
  { slug: "fitness", label: "Fitness" },
  { slug: "arts-crafts", label: "Arts & Crafts" },
  { slug: "handmade-artisan", label: "Handmade & Artisan" },
  { slug: "professional-services", label: "Professional Services" },
  { slug: "home-services", label: "Home Services" },
  { slug: "travel-hospitality", label: "Travel & Hospitality" },
  { slug: "specialty-retail", label: "Specialty Retail" },
  { slug: "other", label: "Other" },
];

export const BUSINESS_TYPES = BUSINESS_TYPE_DEFINITIONS;

export const BUSINESS_TYPE_BY_SLUG = new Map(
  BUSINESS_TYPES.map((entry) => [entry.slug, entry])
);

export const BUSINESS_TYPE_BY_LABEL = new Map(
  BUSINESS_TYPES.map((entry) => [entry.label.toLowerCase(), entry])
);

const LEGACY_CATEGORY_TO_BUSINESS_TYPE = new Map([
  ["arts & crafts", "arts-crafts"],
  ["arts & entertainment", "arts-crafts"],
  ["automotive", "automotive"],
  ["baby & maternity", "kids-family"],
  ["bedding & bath", "home-goods"],
  ["books & media", "bookstore"],
  ["clothing & accessories", "boutique"],
  ["computers & accessories", "tech-shop"],
  ["fitness & wellness", "fitness"],
  ["food & drink", "food-drink"],
  ["furniture", "furniture-decor"],
  ["garden & outdoor", "florist-plants"],
  ["grocery & gourmet", "grocery-specialty-foods"],
  ["handmade & artisan", "handmade-artisan"],
  ["health & beauty", "beauty-wellness"],
  ["health & household", "specialty-retail"],
  ["home & kitchen", "home-goods"],
  ["home services", "home-services"],
  ["industrial & scientific", "specialty-retail"],
  ["jewelry & watches", "jewelry"],
  ["kids & family", "kids-family"],
  ["mobile & accessories", "tech-shop"],
  ["music & instruments", "arts-crafts"],
  ["office & school", "specialty-retail"],
  ["pets & animals", "pet-shop"],
  ["photography", "arts-crafts"],
  ["professional services", "professional-services"],
  ["shoes", "boutique"],
  ["smart home", "home-goods"],
  ["sports & outdoors", "fitness"],
  ["sports & recreation", "fitness"],
  ["tech & electronics", "tech-shop"],
  ["tools & home improvement", "home-services"],
  ["toys & games", "gift-shop"],
  ["travel & hospitality", "travel-hospitality"],
  ["travel & luggage", "travel-hospitality"],
  ["video games", "tech-shop"],
]);

export function normalizeBusinessTypeSlug(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getBusinessType(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;

  const bySlug = BUSINESS_TYPE_BY_SLUG.get(normalizeBusinessTypeSlug(normalized));
  if (bySlug) return bySlug;

  return BUSINESS_TYPE_BY_LABEL.get(normalized.toLowerCase()) || null;
}

export function inferBusinessTypeFromLegacyCategory(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;

  const mappedSlug = LEGACY_CATEGORY_TO_BUSINESS_TYPE.get(normalized);
  if (mappedSlug) {
    return BUSINESS_TYPE_BY_SLUG.get(mappedSlug) || null;
  }

  if (
    normalized.includes("boutique") ||
    normalized.includes("fashion") ||
    normalized.includes("clothing")
  ) {
    return BUSINESS_TYPE_BY_SLUG.get("boutique") || null;
  }
  if (normalized.includes("thrift") || normalized.includes("vintage")) {
    return BUSINESS_TYPE_BY_SLUG.get("thrift-vintage") || null;
  }
  if (normalized.includes("gift")) {
    return BUSINESS_TYPE_BY_SLUG.get("gift-shop") || null;
  }
  if (normalized.includes("home")) {
    return BUSINESS_TYPE_BY_SLUG.get("home-goods") || null;
  }
  if (normalized.includes("furniture") || normalized.includes("decor")) {
    return BUSINESS_TYPE_BY_SLUG.get("furniture-decor") || null;
  }
  if (
    normalized.includes("beauty") ||
    normalized.includes("wellness") ||
    normalized.includes("spa") ||
    normalized.includes("salon")
  ) {
    return BUSINESS_TYPE_BY_SLUG.get("beauty-wellness") || null;
  }
  if (
    normalized.includes("food") ||
    normalized.includes("drink") ||
    normalized.includes("coffee") ||
    normalized.includes("restaurant")
  ) {
    return BUSINESS_TYPE_BY_SLUG.get("food-drink") || null;
  }
  if (normalized.includes("grocery")) {
    return BUSINESS_TYPE_BY_SLUG.get("grocery-specialty-foods") || null;
  }
  if (normalized.includes("flor") || normalized.includes("plant") || normalized.includes("garden")) {
    return BUSINESS_TYPE_BY_SLUG.get("florist-plants") || null;
  }
  if (normalized.includes("pet")) {
    return BUSINESS_TYPE_BY_SLUG.get("pet-shop") || null;
  }
  if (normalized.includes("book")) {
    return BUSINESS_TYPE_BY_SLUG.get("bookstore") || null;
  }
  if (normalized.includes("jewel")) {
    return BUSINESS_TYPE_BY_SLUG.get("jewelry") || null;
  }
  if (normalized.includes("kid") || normalized.includes("family") || normalized.includes("baby")) {
    return BUSINESS_TYPE_BY_SLUG.get("kids-family") || null;
  }
  if (normalized.includes("tech") || normalized.includes("computer") || normalized.includes("electronic")) {
    return BUSINESS_TYPE_BY_SLUG.get("tech-shop") || null;
  }
  if (normalized.includes("fitness") || normalized.includes("sport")) {
    return BUSINESS_TYPE_BY_SLUG.get("fitness") || null;
  }
  if (normalized.includes("art") || normalized.includes("craft")) {
    return BUSINESS_TYPE_BY_SLUG.get("arts-crafts") || null;
  }
  if (normalized.includes("handmade") || normalized.includes("artisan")) {
    return BUSINESS_TYPE_BY_SLUG.get("handmade-artisan") || null;
  }
  if (normalized.includes("professional")) {
    return BUSINESS_TYPE_BY_SLUG.get("professional-services") || null;
  }
  if (normalized.includes("service")) {
    return BUSINESS_TYPE_BY_SLUG.get("home-services") || null;
  }
  if (normalized.includes("travel") || normalized.includes("hospitality") || normalized.includes("hotel")) {
    return BUSINESS_TYPE_BY_SLUG.get("travel-hospitality") || null;
  }

  return BUSINESS_TYPE_BY_SLUG.get("specialty-retail") || null;
}

export function getBusinessTypeOptions() {
  return BUSINESS_TYPES.map((entry) => ({
    label: entry.label,
    value: entry.slug,
    slug: entry.slug,
  }));
}
