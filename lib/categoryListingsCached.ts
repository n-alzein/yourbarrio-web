import "server-only";

import { unstable_cache } from "next/cache";
import { getPublicSupabaseServerClient } from "@/lib/supabasePublicServer";
import { fetchCategoryBySlug } from "@/lib/categories";
import { findBusinessOwnerIdsForLocation } from "@/lib/location/businessLocationSearch";
import {
  getLocationCacheKey,
  getNormalizedLocation,
  hasUsableLocationFilter,
} from "@/lib/location/filter";

export type CategoryRow = {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
} | null;

export type SupabaseListing = {
  id: string;
  public_id?: string | null;
  title?: string | null;
  price?: number | string | null;
  photo_url?: string | null;
  created_at?: string | null;
};

export type ListingsResult = {
  listings: SupabaseListing[];
  error: Error | null;
  branch: string;
  fallbacks: string[];
};

const DEFAULT_LIMIT = 40;
const LISTINGS_COLUMNS = "id,public_id,title,price,photo_url,created_at";

export async function getCategoryRowCached(slug: string): Promise<CategoryRow> {
  const normalized = typeof slug === "string" ? slug.trim() : "";
  if (!normalized) return null;
  const cached = unstable_cache(
    async () => {
      const supabase = getPublicSupabaseServerClient();
      return fetchCategoryBySlug(supabase, normalized);
    },
    ["category:row", normalized],
    {
      revalidate: 60,
      tags: ["category:row", `category:${normalized}`],
    }
  );
  return cached();
}

export async function getCategoryListingsCached({
  categoryId,
  categoryName,
  categorySlug,
  location,
  limit,
}: {
  categoryId?: string | null;
  categoryName?: string | null;
  categorySlug?: string | null;
  location?: {
    city?: string | null;
    region?: string | null;
    state?: string | null;
    lat?: number | string | null;
    lng?: number | string | null;
  } | null;
  limit?: number;
}): Promise<ListingsResult> {
  const normalizedSlug = typeof categorySlug === "string" ? categorySlug.trim() : "";
  const normalizedName = typeof categoryName === "string" ? categoryName.trim() : "";
  const normalizedLocation = getNormalizedLocation(location || {});
  const resolvedLimit = typeof limit === "number" ? limit : DEFAULT_LIMIT;

  if (!hasUsableLocationFilter(normalizedLocation)) {
    return { listings: [], error: null, branch: "no-location", fallbacks: [] };
  }

  const cacheTags = ["category:listings"];
  if (normalizedSlug) cacheTags.push(`category:${normalizedSlug}`);
  cacheTags.push(`location:${getLocationCacheKey(normalizedLocation)}`);

  const cached = unstable_cache(
    async () => {
      const supabase = getPublicSupabaseServerClient();
      const businessIds = await findBusinessOwnerIdsForLocation(supabase, normalizedLocation, {
        limit: 1000,
      });
      if (businessIds.length === 0) {
        return { listings: [], error: null, branch: "no-businesses", fallbacks: [] };
      }
      const buildBaseQuery = () =>
        supabase
          .from("public_listings_v")
          .select(LISTINGS_COLUMNS)
          .order("created_at", { ascending: false })
          .limit(resolvedLimit)
          .in("business_id", businessIds);

      let data: SupabaseListing[] = [];
      let error: Error | null = null;
      const fallbacks: string[] = [];
      let branch = "none";
      if (categoryId) {
        branch = "category_id";
        const primaryRes = await buildBaseQuery().eq("category_id", categoryId);
        data = primaryRes.data || [];
        error = primaryRes.error;

        if (!error && Array.isArray(data) && data.length === 0 && normalizedName) {
          fallbacks.push("category_name");
          const fallbackRes = await buildBaseQuery().ilike("category", normalizedName);
          data = fallbackRes.data || [];
          error = fallbackRes.error;
        }
        if (!error && Array.isArray(data) && data.length === 0 && normalizedSlug) {
          fallbacks.push("category_slug");
          const slugFallbackRes = await buildBaseQuery().ilike("category", normalizedSlug);
          data = slugFallbackRes.data || [];
          error = slugFallbackRes.error;
        }
      } else if (normalizedName) {
        branch = "legacy_category";
        const legacyRes = await buildBaseQuery().ilike("category", normalizedName);
        data = legacyRes.data || [];
        error = legacyRes.error;

        if (!error && Array.isArray(data) && data.length === 0 && normalizedSlug) {
          fallbacks.push("category_slug");
          const slugFallbackRes = await buildBaseQuery().ilike("category", normalizedSlug);
          data = slugFallbackRes.data || [];
          error = slugFallbackRes.error;
        }
      }

      if (error) {
        return { listings: [], error, branch, fallbacks };
      }
      return { listings: Array.isArray(data) ? data : [], error: null, branch, fallbacks };
    },
    [
      "category:listings",
      categoryId || "none",
      normalizedName || "none",
      normalizedSlug || "none",
      getLocationCacheKey(normalizedLocation),
      String(resolvedLimit),
    ],
    {
      revalidate: 60,
      tags: cacheTags,
    }
  );

  return cached();
}
