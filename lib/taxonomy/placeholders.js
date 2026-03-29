import {
  getBusinessTypePlaceholder as getMappedBusinessTypePlaceholder,
} from "@/lib/placeholders/businessPlaceholders";
import { getBusinessTypeSlug, getListingCategorySlug } from "@/lib/taxonomy/compat";

const DEFAULT_LISTING_PLACEHOLDER = "/listing-placeholder.png";

const LISTING_CATEGORY_KEYWORDS = [
  ["food-and-drink", "/images/fallback/categories/gourmet.png"],
  ["grocery-and-gourmet", "/images/fallback/categories/gourmet.png"],
  ["health-and-beauty", "/images/fallback/categories/beauty.png"],
  ["fitness-and-wellness", "/images/fallback/categories/beauty.png"],
  ["home-and-kitchen", "/images/fallback/categories/home-and-kitchen.png"],
  ["furniture", "/images/fallback/categories/home-and-kitchen.png"],
  ["clothing-and-accessories", "/images/fallback/categories/fashion.png"],
  ["shoes", "/images/fallback/categories/fashion.png"],
  ["tech-and-electronics", "/images/fallback/categories/tech.png"],
  ["computers-and-accessories", "/images/fallback/categories/tech.png"],
  ["mobile-and-accessories", "/images/fallback/categories/tech.png"],
  ["video-games", "/images/fallback/categories/tech.png"],
  ["pets-and-animals", "/images/fallback/categories/pets.png"],
  ["garden-and-outdoor", "/images/fallback/categories/garden.png"],
  ["arts-and-crafts", "/images/fallback/categories/creative.png"],
  ["arts-and-entertainment", "/images/fallback/categories/creative.png"],
  ["music-and-instruments", "/images/fallback/categories/creative.png"],
  ["photography", "/images/fallback/categories/creative.png"],
  ["handmade-and-artisan", "/images/fallback/categories/handmade.png"],
  ["kids-and-family", "/images/fallback/categories/kids.png"],
  ["baby-and-maternity", "/images/fallback/categories/kids.png"],
  ["tools-and-home-improvement", "/images/fallback/categories/tools.png"],
  ["professional-services", "/images/fallback/categories/service.png"],
  ["home-services", "/images/fallback/categories/service.png"],
  ["travel-and-hospitality", "/images/fallback/categories/travel.png"],
  ["travel-and-luggage", "/images/fallback/categories/travel.png"],
];

export function getBusinessTypePlaceholder(input) {
  const slug = getBusinessTypeSlug(input);
  return getMappedBusinessTypePlaceholder(slug || input?.category || null);
}

export function getListingCategoryPlaceholder(input) {
  const slug = getListingCategorySlug(input);
  const match = LISTING_CATEGORY_KEYWORDS.find(([keyword]) => slug.includes(keyword));
  return match?.[1] || DEFAULT_LISTING_PLACEHOLDER;
}
