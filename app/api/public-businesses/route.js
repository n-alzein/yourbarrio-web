import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { findBusinessesForLocation } from "@/lib/location/businessLocationSearch";
import {
  getCandidateCoordinates,
  getNormalizedLocation,
  hasUsableLocationFilter,
  haversineDistanceKm,
} from "@/lib/location/filter";
import { getBusinessTypeLabel } from "@/lib/taxonomy/compat";

const CACHE_SECONDS = 120;
const GEOCODE_KEY = process.env.MAPBOX_GEOCODING_TOKEN || process.env.GOOGLE_GEOCODING_API_KEY || "";
const VERIFIED_STATUSES = ["auto_verified", "manually_verified"];
const RECENT_BUSINESS_DAYS = 45;
const RECENT_ACTIVITY_DAYS = 30;

function normalizeCategoryToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function createSupabaseClient() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    throw new Error("Missing Supabase configuration");
  }
  return supabase;
}

const geocodeCache = new Map();

async function geocodeAddress(address) {
  if (!address || !GEOCODE_KEY) return null;
  const key = address.toLowerCase().trim();
  if (geocodeCache.has(key)) return geocodeCache.get(key);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    address
  )}.json?limit=1&access_token=${GEOCODE_KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`geocode ${res.status}`);
    const data = await res.json();
    const center = data?.features?.[0]?.center;
    if (Array.isArray(center) && center.length >= 2 && typeof center[0] === "number" && typeof center[1] === "number") {
      const coords = { lng: center[0], lat: center[1] };
      geocodeCache.set(key, coords);
      return coords;
    }
  } catch (err) {
    console.warn("geocode failed", address, err?.message || err);
  }
  geocodeCache.set(key, null);
  return null;
}

function isVerifiedBusiness(row) {
  return VERIFIED_STATUSES.includes(row?.verification_status);
}

function daysSince(value) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return (Date.now() - time) / (1000 * 60 * 60 * 24);
}

function getCompletenessScore(row) {
  let score = 0;
  if (row?.profile_photo_url || row?.cover_photo_url) score += 2;
  if (row?.description && String(row.description).trim().length >= 24) score += 2;
  if (row?.website) score += 1;
  if (row?.address && row?.city && row?.state) score += 1;
  if (getCandidateCoordinates(row)) score += 1;
  return score;
}

function getDiscoveryRank(row, location) {
  const coords = getCandidateCoordinates(row);
  const hasDistance =
    coords &&
    Number.isFinite(location?.lat) &&
    Number.isFinite(location?.lng);
  const distanceKm = hasDistance ? haversineDistanceKm(coords, location) : null;
  const updatedDays = daysSince(row?.updated_at);
  const createdDays = daysSince(row?.created_at);
  const recentActivityScore =
    Number.isFinite(updatedDays) && updatedDays <= RECENT_ACTIVITY_DAYS
      ? Math.max(0, RECENT_ACTIVITY_DAYS - updatedDays) / RECENT_ACTIVITY_DAYS
      : 0;
  const newBusinessScore =
    Number.isFinite(createdDays) && createdDays <= RECENT_BUSINESS_DAYS
      ? Math.max(0, RECENT_BUSINESS_DAYS - createdDays) / RECENT_BUSINESS_DAYS
      : 0;
  const distanceScore =
    typeof distanceKm === "number" && Number.isFinite(distanceKm)
      ? Math.max(0, 1 - Math.min(distanceKm, 25) / 25)
      : 0;

  return {
    distanceKm,
    score:
      (isVerifiedBusiness(row) ? 100 : 0) +
      getCompletenessScore(row) * 8 +
      recentActivityScore * 10 +
      newBusinessScore * 7 +
      distanceScore * 4,
  };
}

async function fetchBusinessCategories(supabase) {
  const { data, error } = await supabase
    .from("business_categories")
    .select("id,name,slug,is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.warn("business_categories lookup failed", error);
    return [];
  }

  return Array.isArray(data)
    ? data
        .filter((category) => category?.id && category?.name)
        .map((category) => ({
          id: category.id,
          name: category.name,
          slug: category.slug || normalizeCategoryToken(category.name),
        }))
    : [];
}

function matchBusinessCategory(row, categories) {
  if (!row || !Array.isArray(categories) || categories.length === 0) return null;
  const tokens = [
    row.business_category_id,
    row.business_category_slug,
    row.business_type,
    row.category,
  ]
    .map(normalizeCategoryToken)
    .filter(Boolean);
  if (!tokens.length) return null;

  return (
    categories.find((category) => {
      const categoryTokens = [
        category.id,
        category.slug,
        category.name,
      ]
        .map(normalizeCategoryToken)
        .filter(Boolean);
      return categoryTokens.some((token) => tokens.includes(token));
    }) || null
  );
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const location = getNormalizedLocation({
      city: searchParams.get("city"),
      region: searchParams.get("state") || searchParams.get("region"),
      lat: searchParams.get("lat"),
      lng: searchParams.get("lng"),
    });

    const supabase = await createSupabaseClient();
    const categories = await fetchBusinessCategories(supabase);

    if (!hasUsableLocationFilter(location)) {
      return NextResponse.json(
        { businesses: [], categories: [], message: "missing_location" },
        { status: 200 }
      );
    }

    const rows = await findBusinessesForLocation(supabase, location, { limit: 1000 });

    const parseNum = (val) => {
      if (typeof val === "number" && Number.isFinite(val)) return val;
      const parsed = parseFloat(val);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const rankedRows = rows
      .map((row) => {
        const rank = getDiscoveryRank(row, location);
        return {
          row,
          rank,
        };
      })
      .sort((left, right) => {
        const scoreDelta = right.rank.score - left.rank.score;
        if (Math.abs(scoreDelta) > 0.001) return scoreDelta;
        const leftDistance =
          typeof left.rank.distanceKm === "number" ? left.rank.distanceKm : Number.POSITIVE_INFINITY;
        const rightDistance =
          typeof right.rank.distanceKm === "number" ? right.rank.distanceKm : Number.POSITIVE_INFINITY;
        return leftDistance - rightDistance;
      });

    const businesses = await Promise.all(
      rankedRows.map(async ({ row, rank }) => {
        const businessCategory = matchBusinessCategory(row, categories);
        const lat = parseNum(row.latitude ?? row.lat);
        const lng = parseNum(row.longitude ?? row.lng);
        const hasCoords =
          typeof lat === "number" &&
          typeof lng === "number" &&
          lat !== 0 &&
          lng !== 0;

        if (hasCoords) {
          return {
            ...row,
            id: row.owner_user_id,
            category: businessCategory?.name || getBusinessTypeLabel(row, row.category || "Local business"),
            business_category_id: businessCategory?.id || null,
            business_category_slug: businessCategory?.slug || null,
            business_category_name: businessCategory?.name || null,
            latitude: lat,
            longitude: lng,
            lat,
            lng,
            distance_km: rank.distanceKm,
            discovery_rank: rank.score,
            source: "supabase_businesses",
          };
        }

        const addressParts = [row.address, row.city, row.state].filter(Boolean).join(", ");
        const coords = GEOCODE_KEY ? await geocodeAddress(addressParts) : null;

        return {
          ...row,
          id: row.owner_user_id,
          category: businessCategory?.name || getBusinessTypeLabel(row, row.category || "Local business"),
          business_category_id: businessCategory?.id || null,
          business_category_slug: businessCategory?.slug || null,
          business_category_name: businessCategory?.name || null,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          distance_km: rank.distanceKm,
          discovery_rank: rank.score,
          source: "supabase_businesses",
        };
      })
    );

    const usedCategoryIds = new Set(
      businesses
        .map((business) => business.business_category_id)
        .filter(Boolean)
    );
    const usedCategories = categories.filter((category) => usedCategoryIds.has(category.id));

    const resp = NextResponse.json(
      { businesses, categories: usedCategories },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS}`,
        },
      }
    );
    return resp;
  } catch (err) {
    console.warn("public-businesses endpoint error", err);
    return NextResponse.json({ businesses: [], error: "Failed to load businesses" }, { status: 200 });
  }
}
