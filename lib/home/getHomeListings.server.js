import "server-only";

import { getPublicSupabaseServerClient } from "@/lib/supabasePublicServer";
import {
  getListingsBrowseFilterCategoryNames,
  getListingsBrowseFilterCategorySlugs,
  normalizeListingsBrowseCategory,
} from "@/lib/listings/browseCategories";
import { findBusinessOwnerIdsForLocation } from "@/lib/location/businessLocationSearch";
import { getNormalizedLocation, hasUsableLocationFilter } from "@/lib/location/filter";
import { withListingPricing } from "@/lib/pricing";

export async function getHomeListings({ limit = 80, location, category } = {}) {
  const supabase = getPublicSupabaseServerClient();
  const normalizedLocation = getNormalizedLocation(location || {});
  if (!hasUsableLocationFilter(normalizedLocation)) {
    return { data: [], error: null };
  }
  const businessIds = await findBusinessOwnerIdsForLocation(supabase, normalizedLocation, {
    limit: 1000,
  });
  if (businessIds.length === 0) {
    return { data: [], error: null };
  }
  // Public/customer listing reads must use public_listings_v; base listings can include drafts and owner/admin-only rows.
  let query = supabase
    .from("public_listings_v")
    .select(
      "id,title,price,category,listing_category,listing_category_id,category_id,city,photo_url,business_id,created_at,inventory_status,inventory_quantity,low_stock_threshold,inventory_last_updated_at,is_seeded,business_is_seeded"
    )
    .order("created_at", { ascending: false })
    .limit(limit)
    .in("business_id", businessIds);
  const normalizedCategory = normalizeListingsBrowseCategory(category);
  if (!normalizedCategory.isValid) {
    return { data: [], error: null };
  }
  if (normalizedCategory.isDefault) {
    const { data, error } = await query;
    if (error) {
      console.error("getHomeListings failed", error);
      return { data: null, error };
    }
    return { data: (data || []).map((listing) => withListingPricing(listing)), error: null };
  }

  const categoryNames = getListingsBrowseFilterCategoryNames(normalizedCategory.canonical);
  const categorySlugs = getListingsBrowseFilterCategorySlugs(normalizedCategory.canonical);
  if (categoryNames.length || categorySlugs.length) {
    const selectClause =
      "id,title,price,category,listing_category,listing_category_id,category_id,city,photo_url,business_id,created_at,inventory_status,inventory_quantity,low_stock_threshold,inventory_last_updated_at,is_seeded,business_is_seeded";
    const runVariant = (field, values) =>
      values.length
        ? supabase
            .from("public_listings_v")
            .select(selectClause)
            .order("created_at", { ascending: false })
            .limit(limit)
            .in("business_id", businessIds)
            .in(field, values)
        : Promise.resolve({ data: [], error: null });
    const results = await Promise.all([
      runVariant("category", categoryNames),
      runVariant("category", categorySlugs),
    ]);

    const error = results.find((result) => result?.error)?.error || null;
    if (error) {
      console.error("getHomeListings failed", error);
      return { data: null, error };
    }

    const deduped = new Map();
    for (const result of results) {
      for (const row of result?.data || []) {
        if (row?.id) deduped.set(row.id, row);
      }
    }
    return {
      data: Array.from(deduped.values())
        .slice(0, limit)
        .map((listing) => withListingPricing(listing)),
      error: null,
    };
  }

  const { data, error } = await query;
  if (error) {
    console.error("getHomeListings failed", error);
    return { data: null, error };
  }

  return { data: (data || []).map((listing) => withListingPricing(listing)), error: null };
}
