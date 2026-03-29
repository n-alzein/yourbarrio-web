// Legacy shim: the old mixed business/listing category module now proxies to the
// detailed listing taxonomy while business identity uses lib/taxonomy/businessTypes.
export {
  LISTING_CATEGORIES as BUSINESS_CATEGORIES,
  LISTING_CATEGORY_BY_SLUG as CATEGORY_BY_SLUG,
  LISTING_CATEGORY_BY_NAME as CATEGORY_BY_NAME,
  getListingCategory as getBusinessCategory,
  normalizeCategoryName,
  slugifyCategoryName,
} from "@/lib/taxonomy/listingCategories";
