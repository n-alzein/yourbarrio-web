import "server-only";

import { unstable_cache } from "next/cache";
import { getPublicSupabaseServerClient } from "@/lib/supabasePublicServer";
import {
  getListingCategory,
  getListingCategoryDbNames,
  getListingCategoryDbSlugs,
} from "@/lib/taxonomy/listingCategories";
import { findBusinessOwnerIdsForLocation } from "@/lib/location/businessLocationSearch";
import {
  getLocationCacheKey,
  getNormalizedLocation,
  hasUsableLocationFilter,
} from "@/lib/location/filter";
import { withListingPricing } from "@/lib/pricing";

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
  priceCents?: number;
  platformFeeCents?: number;
  finalPriceCents?: number;
  photo_url?: string | null;
  photo_variants?: unknown;
  cover_image_id?: string | null;
  created_at?: string | null;
  is_seeded?: boolean;
  business_is_seeded?: boolean;
};

export type ListingsResult = {
  listings: SupabaseListing[];
  error: Error | null;
  branch: string;
  fallbacks: string[];
};

const DEFAULT_LIMIT = 40;
const LISTINGS_COLUMNS =
  "id,public_id,title,price,photo_url,photo_variants,cover_image_id,created_at,is_seeded,business_is_seeded";

export async function getCategoryRowCached(slug: string): Promise<CategoryRow> {
  const normalized = typeof slug === "string" ? slug.trim() : "";
  if (!normalized) return null;
  const cached = unstable_cache(
    async () => {
      const category = getListingCategory(normalized);
      return category
        ? {
            id: category.slug,
            name: category.label,
            slug: category.slug,
          }
        : null;
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
      const categoryNames = getListingCategoryDbNames(normalizedSlug || normalizedName);
      const categorySlugs = getListingCategoryDbSlugs(normalizedSlug || normalizedName);

      branch = categoryId ? "category_slug" : "listing_category";
      const results = await Promise.all([
        categoryNames.length
          ? buildBaseQuery().in("category", categoryNames)
          : Promise.resolve({ data: [], error: null }),
        categorySlugs.length ? buildBaseQuery().in("category", categorySlugs) : Promise.resolve({ data: [], error: null }),
      ]);

      error = (results.find((result) => result?.error)?.error as Error | null) || null;
      const deduped = new Map();
      for (const result of results) {
        for (const row of result?.data || []) {
          if (row?.id) deduped.set(row.id, row);
        }
      }
      data = Array.from(deduped.values());

      if (error) {
        return { listings: [], error, branch, fallbacks };
      }
      return {
        listings: Array.isArray(data) ? data.map((row) => withListingPricing(row)) : [],
        error: null,
        branch,
        fallbacks,
      };
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
