import "server-only";

import { getPublicSupabaseServerClient } from "@/lib/supabasePublicServer";
import { resolveCategoryIdByName } from "@/lib/categories";

export async function getHomeListings({ limit = 80, city, category } = {}) {
  const supabase = getPublicSupabaseServerClient();
  if (!city) {
    return { data: [], error: null };
  }
  let query = supabase
    .from("public_listings_v")
    .select(
      "id,title,price,category,category_id,city,photo_url,business_id,created_at,inventory_status,inventory_quantity,low_stock_threshold,inventory_last_updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (city) {
    query = query.ilike("city", city);
  }
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
