import { NextResponse } from "next/server";
import { getPublicSupabaseServerClient } from "@/lib/supabasePublicServer";
import {
  getListingsBrowseFilterCategoryNames,
  getListingsBrowseFilterCategorySlugs,
  normalizeListingsBrowseCategory,
} from "@/lib/listings/browseCategories";
import { getLocationFromCookies } from "@/lib/location/getLocationFromCookies";
import { findBusinessOwnerIdsForLocation } from "@/lib/location/businessLocationSearch";
import { getNormalizedLocation, hasUsableLocationFilter } from "@/lib/location/filter";
import { resolveListingCoverImageUrl } from "@/lib/listingPhotos";
import { withListingPricing } from "@/lib/pricing";

async function attachBusinessNames(client, listings) {
  if (!client || !Array.isArray(listings) || listings.length === 0) {
    return Array.isArray(listings) ? listings : [];
  }

  const businessIds = Array.from(
    new Set(
      listings
        .map((listing) => String(listing?.business_id || "").trim())
        .filter(Boolean)
    )
  );

  if (businessIds.length === 0) return listings;

  const { data, error } = await client
    .from("users")
    .select("id,business_name,full_name")
    .in("id", businessIds);

  if (error || !Array.isArray(data)) {
    return listings;
  }

  const businessNameById = new Map(
    data.map((row) => [
      String(row?.id || "").trim(),
      String(row?.business_name || row?.full_name || "").trim() || null,
    ])
  );

  return listings.map((listing) => ({
    ...listing,
    business_name: businessNameById.get(String(listing?.business_id || "").trim()) || null,
  }));
}

const LISTING_SELECT =
  "id,public_id,title,price,category,category_id,city,photo_url,photo_variants,cover_image_id,business_id,created_at,inventory_status,inventory_quantity,low_stock_threshold,inventory_last_updated_at";

function buildBaseHomeListingsQuery(client, { limit, searchQuery, businessIds }) {
  if (!Array.isArray(businessIds) || businessIds.length === 0) {
    return null;
  }

  let query = client
    .from("public_listings_v")
    .select(LISTING_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit)
    .in("business_id", businessIds);

  if (searchQuery) {
    const safe = searchQuery.replace(/[%_]/g, "").trim();
    if (safe) {
      query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%,category.ilike.%${safe}%`);
    }
  }

  return query;
}

function sortAndLimitListings(rows, limit) {
  return rows
    .sort(
      (left, right) =>
        new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime()
    )
    .slice(0, limit);
}

async function runExactCategoryUnionQuery(client, { limit, searchQuery, businessIds, categoryNames, categorySlugs, branch }) {
  const queryJobs = [];
  if (categoryNames.length > 0) {
    queryJobs.push(
      buildBaseHomeListingsQuery(client, { limit, searchQuery, businessIds }).in("category", categoryNames)
    );
  }
  if (categorySlugs.length > 0) {
    queryJobs.push(
      buildBaseHomeListingsQuery(client, { limit, searchQuery, businessIds }).in("category", categorySlugs)
    );
  }

  if (queryJobs.length === 0) {
    return {
      data: [],
      error: null,
      debug: { branch, categoryNames, categorySlugs },
    };
  }

  const results = await Promise.all(queryJobs);
  const firstError = results.find((result) => result?.error)?.error || null;
  if (firstError) {
    return {
      data: [],
      error: firstError,
      debug: { branch: `${branch}-error` },
    };
  }

  const deduped = new Map();
  for (const result of results) {
    for (const row of result?.data || []) {
      const key = String(row?.id || "").trim();
      if (key) deduped.set(key, row);
    }
  }

  return {
    data: sortAndLimitListings(Array.from(deduped.values()), limit),
    error: null,
    debug: { branch, categoryNames, categorySlugs },
  };
}

async function runHomeListingsQuery(client, { limit, category, searchQuery, businessIds }) {
  const baseQuery = buildBaseHomeListingsQuery(client, { limit, searchQuery, businessIds });
  if (!baseQuery) {
    return { data: [], error: null, debug: { branch: "no-businesses" } };
  }

  const normalizedCategory = normalizeListingsBrowseCategory(category);
  if (!normalizedCategory.isValid) {
    return {
      data: [],
      error: null,
      debug: { branch: "invalid-category", raw: normalizedCategory.raw || null },
    };
  }

  if (normalizedCategory.isDefault) {
    const { data, error } = await baseQuery;
    return {
      data: data || [],
      error,
      debug: { branch: "all-listings" },
    };
  }

  const categoryNames = getListingsBrowseFilterCategoryNames(normalizedCategory.canonical);
  const categorySlugs = getListingsBrowseFilterCategorySlugs(normalizedCategory.canonical);
  return runExactCategoryUnionQuery(client, {
    limit,
    searchQuery,
    businessIds,
    categoryNames,
    categorySlugs,
    branch: `category-union:${normalizedCategory.canonical}`,
  });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit") || 80);
    const limit = Number.isFinite(limitParam) ? Math.max(1, limitParam) : 80;
    const cookieLocation = await getLocationFromCookies();
    const location = getNormalizedLocation({
      ...(cookieLocation || {}),
      city: url.searchParams.get("city") || cookieLocation?.city,
      region:
        url.searchParams.get("state") ||
        url.searchParams.get("region") ||
        cookieLocation?.region,
      lat: url.searchParams.get("lat") || cookieLocation?.lat,
      lng: url.searchParams.get("lng") || cookieLocation?.lng,
    });
    const category = url.searchParams.get("category") || null;
    const normalizedCategory = normalizeListingsBrowseCategory(category);
    const searchQuery = url.searchParams.get("q") || null;
    const supabase = getPublicSupabaseServerClient();

    if (!normalizedCategory.isValid) {
      if (process.env.NODE_ENV !== "production") {
        console.info("[home-listings] invalid category", {
          rawCategory: category,
        });
      }
      console.log("[public listings]", { count: 0 });
      return NextResponse.json(
        { listings: [], message: "invalid_category" },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            "x-home-listings-count": "0",
            "x-home-listings-source": "invalid-category",
          },
        }
      );
    }

    if (!hasUsableLocationFilter(location)) {
      console.log("[public listings]", { count: 0 });
      return NextResponse.json(
        { listings: [], message: "missing_location" },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            "x-home-listings-count": "0",
            "x-home-listings-source": "none",
          },
        }
      );
    }

    const businessIds = await findBusinessOwnerIdsForLocation(supabase, location, {
      limit: 1000,
      viewerCanSeeInternalContent: false,
    });

    const { data, error, debug } = await runHomeListingsQuery(supabase, {
      limit,
      category: normalizedCategory.canonical,
      searchQuery,
      businessIds,
    });

    if (process.env.NODE_ENV !== "production" && normalizedCategory.canonical !== "all") {
      console.info("[home-listings] public category filter", debug);
    }

    if (error) {
      console.error("[public listings error]", error);
      console.log("[public listings]", { count: 0 });
      return NextResponse.json(
        { listings: [] },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            "x-home-listings-count": "0",
            "x-home-listings-source": "error",
          },
        }
      );
    }

    let listings = Array.isArray(data) ? data : [];
    listings = await attachBusinessNames(supabase, listings);
    listings = listings.map((listing) =>
      withListingPricing({
        ...listing,
        photo_url: resolveListingCoverImageUrl(listing) || listing.photo_url || null,
      })
    );

    console.log("[public listings]", { count: listings.length });

    const headers =
      listings.length === 0
      ? {
          "Cache-Control": "no-store",
          "x-home-listings-count": "0",
          "x-home-listings-source": "public",
        }
      : {
          "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60",
          "x-home-listings-count": String(listings.length),
          "x-home-listings-source": "public",
        };

    return NextResponse.json({ listings }, { status: 200, headers });
  } catch (e) {
    console.error("[public listings fatal]", e);
    console.log("[public listings]", { count: 0 });
    return NextResponse.json(
      { listings: [] },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "x-home-listings-count": "0",
          "x-home-listings-source": "fatal",
        },
      }
    );
  }
}
