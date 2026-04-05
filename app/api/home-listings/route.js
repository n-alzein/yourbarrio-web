import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServerClient as getSupabaseServiceClient } from "@/lib/supabase/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { resolveCategoryIdByName } from "@/lib/categories";
import { getLocationFromCookies } from "@/lib/location/getLocationFromCookies";
import { findBusinessOwnerIdsForLocation } from "@/lib/location/businessLocationSearch";
import { getNormalizedLocation, hasUsableLocationFilter } from "@/lib/location/filter";

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

async function runHomeListingsQuery(client, { limit, category, searchQuery, businessIds }) {
  if (!Array.isArray(businessIds) || businessIds.length === 0) {
    return { data: [], error: null };
  }

  let query = client
    .from("public_listings_v")
    .select(
      "id,public_id,title,price,category,category_id,city,photo_url,business_id,created_at,inventory_status,inventory_quantity,low_stock_threshold,inventory_last_updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit)
    .in("business_id", businessIds);

  if (searchQuery) {
    const safe = searchQuery.replace(/[%_]/g, "").trim();
    if (safe) {
      query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%,category.ilike.%${safe}%`);
    }
  }
  if (category) {
    const categoryId = await resolveCategoryIdByName(client, category);
    if (categoryId) {
      query = query.eq("category_id", categoryId);
    } else {
      query = query.eq("category", category);
    }
  }

  return query;
}

export async function GET(request) {
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
  const searchQuery = url.searchParams.get("q") || null;
  const supabaseHost = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host;
    } catch {
      return "unknown";
    }
  })();

  const cookieStore = await cookies();
  const sessionPresent = cookieStore.getAll().length > 0;
  const sessionClient = await getSupabaseServerClient();
  const serviceClient = getSupabaseServiceClient();

  const errors = [];
  let listings = [];
  let source = "none";

  if (!hasUsableLocationFilter(location)) {
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

  const businessIds = await findBusinessOwnerIdsForLocation(serviceClient || sessionClient, location, {
    limit: 1000,
  });

  try {
    const { data, error } = await runHomeListingsQuery(sessionClient, {
      limit,
      category,
      searchQuery,
      businessIds,
    });
    if (error) {
      errors.push(`session:${error.message || String(error)}`);
    } else if (Array.isArray(data) && data.length > 0) {
      listings = data;
      source = "session";
    }
  } catch (err) {
    errors.push(`session:${err?.message || String(err)}`);
  }

  if ((!listings.length || source === "none") && serviceClient) {
    try {
      const { data, error } = await runHomeListingsQuery(serviceClient, {
        limit,
        category,
        searchQuery,
        businessIds,
      });
      if (error) {
        errors.push(`service:${error.message || String(error)}`);
      } else if (Array.isArray(data)) {
        listings = data;
        source = "service";
      }
    } catch (err) {
      errors.push(`service:${err?.message || String(err)}`);
    }
  }

  if (listings.length === 0) {
    console.warn("[HOME_LISTINGS_PROD] 0 results", {
      supabaseHost,
      limit,
      location,
      category,
      sessionPresent,
      sourceTried: source,
      errors,
    });
  }

  if (listings.length > 0) {
    listings = await attachBusinessNames(serviceClient || sessionClient, listings);
  }

  if (!listings.length && errors.length) {
    return NextResponse.json(
      { error: "Home listings unavailable." },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
          "x-home-listings-count": "0",
          "x-home-listings-source": "none",
        },
      }
    );
  }

  const headers =
    listings.length === 0
      ? {
          "Cache-Control": "no-store",
          "x-home-listings-count": "0",
          "x-home-listings-source": source,
        }
      : {
          "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60",
          "x-home-listings-count": String(listings.length),
          "x-home-listings-source": source,
        };

  return NextResponse.json({ listings }, { status: 200, headers });
}
