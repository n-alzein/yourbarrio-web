export function slugifyCategoryName(name = "") {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeCategoryName(name = "") {
  return String(name || "").trim().replace(/\s+/g, " ");
}

const CORE_LISTING_CATEGORY_NAMES = [
  "Arts & Crafts",
  "Arts & Entertainment",
  "Automotive",
  "Baby & Maternity",
  "Bedding & Bath",
  "Books & Media",
  "Clothing & Accessories",
  "Computers & Accessories",
  "Fitness & Wellness",
  "Food & Drink",
  "Furniture",
  "Garden & Outdoor",
  "Grocery & Gourmet",
  "Handmade & Artisan",
  "Health & Beauty",
  "Health & Household",
  "Home & Kitchen",
  "Home Services",
  "Industrial & Scientific",
  "Jewelry & Watches",
  "Kids & Family",
  "Mobile & Accessories",
  "Music & Instruments",
  "Office & School",
  "Pets & Animals",
  "Photography",
  "Professional Services",
  "Shoes",
  "Smart Home",
  "Sports & Outdoors",
  "Sports & Recreation",
  "Tech & Electronics",
  "Tools & Home Improvement",
  "Toys & Games",
  "Travel & Hospitality",
  "Travel & Luggage",
  "Video Games",
];

export const LISTING_CATEGORIES = CORE_LISTING_CATEGORY_NAMES.map((name) => ({
  name,
  slug: slugifyCategoryName(name),
}));

export const LISTING_CATEGORY_BY_SLUG = new Map(
  LISTING_CATEGORIES.map((category) => [category.slug, category])
);

export const LISTING_CATEGORY_BY_NAME = new Map(
  LISTING_CATEGORIES.map((category) => [normalizeCategoryName(category.name), category])
);

export function getListingCategory(value) {
  const normalized = normalizeCategoryName(value);
  if (!normalized) return null;
  return (
    LISTING_CATEGORY_BY_SLUG.get(slugifyCategoryName(normalized)) ||
    LISTING_CATEGORY_BY_NAME.get(normalized) ||
    null
  );
}

export function getListingCategoryOptions() {
  return LISTING_CATEGORIES.map((category) => ({
    label: category.name,
    value: category.name,
    slug: category.slug,
  }));
}
