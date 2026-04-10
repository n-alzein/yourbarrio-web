import "server-only";

import { fetchFeaturedCategories, type FeaturedCategory } from "@/lib/strapi";
import { getPublicSupabaseServerClient } from "@/lib/supabasePublicServer";
import { findBusinessOwnerIdsForLocation } from "@/lib/location/businessLocationSearch";
import { getNormalizedLocation } from "@/lib/location/filter";

export type BrowseMode = "public" | "customer";

export type ListingSummary = {
  id: string;
  public_id?: string | null;
  title: string | null;
  description: string | null;
  price: number | string | null;
  listing_category?: string | null;
  category: string | null;
  category_id: string | number | null;
  category_info?: { name?: string | null; slug?: string | null } | null;
  city: string | null;
  photo_url: unknown;
  business_id: string | null;
  business_name?: string | null;
  created_at: string | null;
  inventory_status?: string | null;
  inventory_quantity?: number | null;
  low_stock_threshold?: number | null;
  inventory_last_updated_at?: string | null;
};

export type CategorySummary = FeaturedCategory;

export type HomeBrowseData = {
  featuredCategories: CategorySummary[];
  featuredCategoriesError: string | null;
  listings: ListingSummary[];
  city: string | null;
  zip: string | null;
};

type GetHomeBrowseDataArgs = {
  mode: BrowseMode;
  location?: {
    city?: string | null;
    region?: string | null;
    state?: string | null;
    lat?: number | string | null;
    lng?: number | string | null;
  } | null;
  limit?: number;
};

const PUBLIC_LISTING_SELECT = [
  "id",
  "public_id",
  "title",
  "description",
  "price",
  "category",
  "category_id",
  "city",
  "photo_url",
  "business_id",
  "created_at",
  "inventory_status",
  "inventory_quantity",
  "low_stock_threshold",
  "inventory_last_updated_at",
].join(",");

async function attachBusinessNames(listings: ListingSummary[]) {
  if (!Array.isArray(listings) || listings.length === 0) return [];

  const businessIds = Array.from(
    new Set(
      listings
        .map((listing) => String(listing?.business_id || "").trim())
        .filter(Boolean)
    )
  );

  if (businessIds.length === 0) return listings;

  const supabase = getPublicSupabaseServerClient();
  const { data, error } = await supabase
    .from("users")
    .select("id,business_name,full_name")
    .in("id", businessIds);

  if (error || !Array.isArray(data)) {
    return listings;
  }

  const businessNameById = new Map(
    data.map((row) => [
      String(row?.id || ""),
      String(row?.business_name || row?.full_name || "").trim() || null,
    ])
  );

  return listings.map((listing) => ({
    ...listing,
    business_name: businessNameById.get(String(listing?.business_id || "").trim()) || null,
  }));
}

function normalizeText(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

async function tryLoadFromPublicListingsView({
  location,
  limit,
}: {
  location: ReturnType<typeof getNormalizedLocation>;
  limit: number;
}) {
  const supabase = getPublicSupabaseServerClient();
  const businessIds = await findBusinessOwnerIdsForLocation(supabase, location, { limit: 1000 });
  if (businessIds.length === 0) {
    return { data: [] as ListingSummary[], error: null };
  }
  let query = supabase
    .from("public_listings_v")
    .select(PUBLIC_LISTING_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit)
    .in("business_id", businessIds);

  const { data, error } = await query;
  if (error) return { data: null, error };
  return { data: (data ?? []) as unknown as ListingSummary[], error: null };
}

async function tryLoadFromListingsTable({
  location,
  limit,
}: {
  location: ReturnType<typeof getNormalizedLocation>;
  limit: number;
}) {
  const supabase = getPublicSupabaseServerClient();
  const businessIds = await findBusinessOwnerIdsForLocation(supabase, location, { limit: 1000 });
  if (businessIds.length === 0) {
    return { data: [] as ListingSummary[], error: null };
  }
  let query = supabase
    .from("public_listings")
    .select(PUBLIC_LISTING_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit)
    .in("business_id", businessIds);

  const { data, error } = await query;
  if (error) {
    return { data: [] as ListingSummary[], error: "legacy_public_listings_query_failed" };
  }
  return { data: (data ?? []) as unknown as ListingSummary[], error: null };
}

async function loadPublicSafeListings({
  location,
  limit,
}: {
  location: ReturnType<typeof getNormalizedLocation>;
  limit: number;
}) {
  const fromView = await tryLoadFromPublicListingsView({ location, limit });
  if (!fromView.error && fromView.data) return fromView.data;

  const fromLegacyView = await tryLoadFromListingsTable({ location, limit });
  if (!fromLegacyView.error && Array.isArray(fromLegacyView.data)) return fromLegacyView.data;

  return [];
}

export async function getHomeBrowseData({
  mode,
  location,
  limit = 80,
}: GetHomeBrowseDataArgs): Promise<HomeBrowseData> {
  void mode;
  const normalizedLocation = getNormalizedLocation(location || {});
  const safeCity = normalizeText(normalizedLocation.city);
  const safeZip = null;
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 120) : 80;

  let featuredCategories: FeaturedCategory[] = [];
  let featuredCategoriesError: string | null = null;
  const [categoriesResult, listingsResult] = await Promise.all([
    fetchFeaturedCategories()
      .then((data) => ({ data, error: null as string | null }))
      .catch((error) => {
        console.error("Failed to load featured categories:", error);
        return {
          data: [] as FeaturedCategory[],
          error: "We couldn't load categories right now.",
        };
      }),
    loadPublicSafeListings({
      location: normalizedLocation,
      limit: safeLimit,
    }).then((listings) => attachBusinessNames(listings)),
  ]);

  featuredCategories = categoriesResult.data;
  featuredCategoriesError = categoriesResult.error;

  return {
    featuredCategories,
    featuredCategoriesError,
    listings: listingsResult,
    city: safeCity,
    zip: safeZip,
  };
}
