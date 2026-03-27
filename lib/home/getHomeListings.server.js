import "server-only";

import { getPublicSupabaseServerClient } from "@/lib/supabasePublicServer";
import { resolveCategoryIdByName } from "@/lib/categories";
import { findBusinessOwnerIdsForLocation } from "@/lib/location/businessLocationSearch";
import { getNormalizedLocation, hasUsableLocationFilter } from "@/lib/location/filter";

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
  let query = supabase
    .from("public_listings_v")
    .select(
      "id,title,price,category,category_id,city,photo_url,business_id,created_at,inventory_status,inventory_quantity,low_stock_threshold,inventory_last_updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit)
    .in("business_id", businessIds);
  if (category) {
    const categoryId = await resolveCategoryIdByName(supabase, category);
    if (categoryId) {
      query = query.eq("category_id", categoryId);
    } else {
      query = query.eq("category", category);
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error("getHomeListings failed", error);
    return { data: null, error };
  }

  return { data: data || [], error: null };
}
