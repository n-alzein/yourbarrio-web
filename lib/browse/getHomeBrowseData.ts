import "server-only";

import { fetchFeaturedCategories, fetchStrapiBanners, type FeaturedCategory } from "@/lib/strapi";
import { getPublicSupabaseServerClient } from "@/lib/supabasePublicServer";

export type BrowseMode = "public" | "customer";

export type ListingSummary = {
  id: string;
  title: string | null;
  description: string | null;
  price: number | string | null;
  category: string | null;
  category_id: string | number | null;
  category_info?: { name?: string | null; slug?: string | null } | null;
  city: string | null;
  photo_url: unknown;
  business_id: string | null;
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
  banners: unknown[];
  city: string | null;
  zip: string | null;
};

type GetHomeBrowseDataArgs = {
  mode: BrowseMode;
  city?: string | null;
  zip?: string | null;
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

function normalizeText(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

async function tryLoadFromPublicListingsView({
  city,
  zip,
  limit,
}: {
  city: string | null;
  zip: string | null;
  limit: number;
}) {
  const supabase = getPublicSupabaseServerClient();
  let query = supabase
    .from("public_listings_v")
    .select(PUBLIC_LISTING_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (city) {
    query = query.ilike("city", city);
  } else if (zip) {
    query = query.eq("zip", zip);
  }

  const { data, error } = await query;
  if (error) return { data: null, error };
  return { data: (data ?? []) as unknown as ListingSummary[], error: null };
}

async function tryLoadFromListingsTable({
  city,
  zip,
  limit,
}: {
  city: string | null;
  zip: string | null;
  limit: number;
}) {
  const supabase = getPublicSupabaseServerClient();
  let query = supabase
    .from("public_listings")
    .select(PUBLIC_LISTING_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (city) {
    query = query.ilike("city", city);
  } else if (zip) {
    query = query.eq("zip", zip);
  }

  const { data, error } = await query;
  if (error) {
    return { data: [] as ListingSummary[], error: "legacy_public_listings_query_failed" };
  }
  return { data: (data ?? []) as unknown as ListingSummary[], error: null };
}

async function loadPublicSafeListings({
  city,
  zip,
  limit,
}: {
  city: string | null;
  zip: string | null;
  limit: number;
}) {
  const fromView = await tryLoadFromPublicListingsView({ city, zip, limit });
  if (!fromView.error && fromView.data) return fromView.data;

  const fromLegacyView = await tryLoadFromListingsTable({ city, zip, limit });
  if (!fromLegacyView.error && Array.isArray(fromLegacyView.data)) return fromLegacyView.data;

  return [];
}

export async function getHomeBrowseData({
  mode,
  city,
  zip,
  limit = 80,
}: GetHomeBrowseDataArgs): Promise<HomeBrowseData> {
  void mode;
  const safeCity = normalizeText(city);
  const safeZip = normalizeText(zip);
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 120) : 80;

  let featuredCategories: FeaturedCategory[] = [];
  let featuredCategoriesError: string | null = null;
  try {
    featuredCategories = await fetchFeaturedCategories();
  } catch (error) {
    console.error("Failed to load featured categories:", error);
    featuredCategoriesError = "We couldn't load categories right now.";
  }

  const [listings, banners] = await Promise.all([
    loadPublicSafeListings({
      city: safeCity,
      zip: safeZip,
      limit: safeLimit,
    }),
    fetchStrapiBanners().catch(() => []),
  ]);

  return {
    featuredCategories,
    featuredCategoriesError,
    listings,
    banners: Array.isArray(banners) ? banners : [],
    city: safeCity,
    zip: safeZip,
  };
}
