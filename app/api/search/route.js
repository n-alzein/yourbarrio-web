import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { resolveCategoryIdByName } from "@/lib/categories";
import { primaryPhotoUrl } from "@/lib/listingPhotos";
import { getLocationFromCookies } from "@/lib/location/getLocationFromCookies";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS =
  Number.parseInt(process.env.SEARCH_RATE_LIMIT_MAX || "", 10) || 20;
const CACHE_TTL_MS = 60 * 1000;
const rateBuckets = new Map();
const responseCache = new Map();

const sanitize = (value) => (value || "").replace(/[%_]/g, "").trim();

const getClientIp = (request) => {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
};

const isRateLimited = (ip) => {
  if (!ip) return false;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const bucket = rateBuckets.get(ip) || [];
  const recent = bucket.filter((ts) => ts > windowStart);
  recent.push(now);
  rateBuckets.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX_REQUESTS;
};

const getCachedResponse = (key) => {
  if (!key) return null;
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }
  if (cached) {
    responseCache.delete(key);
  }
  return null;
};

const setCachedResponse = (key, payload) => {
  if (!key) return;
  responseCache.set(key, {
    payload,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
};

async function searchListings(supabase, term, category, { city }) {
  const safe = sanitize(term);
  if (!safe) return [];
  const safeCategory = sanitize(category);

  let query = supabase
    .from("listings")
    .select(
      "id,public_id,title,description,price,category,category_id,category_info:business_categories(name,slug),city,photo_url,business_id,created_at,inventory_status,inventory_quantity,low_stock_threshold,inventory_last_updated_at"
    )
    .or(
      `title.ilike.%${safe}%,description.ilike.%${safe}%,category.ilike.%${safe}%`
    );
  if (city) {
    query = query.ilike("city", city);
  }
  if (safeCategory) {
    const categoryId = await resolveCategoryIdByName(supabase, safeCategory);
    if (categoryId) {
      query = query.eq("category_id", categoryId);
    } else {
      query = query.eq("category", safeCategory);
    }
  }
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    console.warn("searchListings failed", error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    public_id: row.public_id || null,
    title: row.title,
    description: row.description,
    price: row.price,
    category: row.category_info?.name || row.category,
    city: row.city,
    photo_url: primaryPhotoUrl(row.photo_url),
    business_id: row.business_id,
    inventory_status: row.inventory_status,
    inventory_quantity: row.inventory_quantity,
    low_stock_threshold: row.low_stock_threshold,
    inventory_last_updated_at: row.inventory_last_updated_at,
    source: "supabase_listing",
  }));
}

async function searchBusinesses(supabase, term, category, { city }) {
  const safe = sanitize(term);
  if (!safe) return [];
  const safeCategory = sanitize(category);

  let query = supabase
    .from("businesses")
    .select(
      "id,owner_user_id,public_id,business_name,category,city,address,description,website,profile_photo_url,verification_status"
    )
    .in("verification_status", ["auto_verified", "manually_verified"])
    .or(
      `business_name.ilike.%${safe}%,category.ilike.%${safe}%,description.ilike.%${safe}%,city.ilike.%${safe}%`
    );
  if (city) {
    query = query.ilike("city", city);
  }
  if (safeCategory) {
    query = query.eq("category", safeCategory);
  }
  const { data, error } = await query.limit(8);

  if (error) {
    console.warn("searchBusinesses failed", error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.owner_user_id,
    public_id: row.public_id || null,
    name: row.business_name || "Local business",
    category: row.category,
    city: row.city,
    address: row.address,
    description: row.description,
    website: row.website,
    image: row.profile_photo_url,
    source: "supabase_business",
  }));
}

const PLACES_DISABLED =
  process.env.NEXT_PUBLIC_DISABLE_PLACES === "true" ||
  process.env.NEXT_PUBLIC_DISABLE_PLACES === "1";

const normalizeCategoryType = (value) =>
  (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

async function searchMapboxPlaces(term) {
  if (PLACES_DISABLED) return [];
  const token =
    process.env.MAPBOX_GEOCODING_TOKEN ||
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return [];

  try {
    const url = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(term)}.json`
    );
    url.searchParams.set("access_token", token);
    url.searchParams.set("types", "poi");
    url.searchParams.set("limit", "5");
    url.searchParams.set("autocomplete", "true");

    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.text();
      console.warn("Mapbox places search failed", res.status, body);
      return [];
    }

    const payload = await res.json();
    return (payload.features || []).map((feature) => {
      const rawCategories = feature.properties?.category || "";
      const types = rawCategories
        .split(",")
        .map(normalizeCategoryType)
        .filter(Boolean);
      return {
        id: feature.id,
        name: feature.text || "Place",
        address: feature.place_name || "",
        types,
        source: "mapbox_places",
      };
    });
  } catch (err) {
    console.warn("Mapbox places search error", err);
    return [];
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") || "").trim();
  const category = (searchParams.get("category") || "").trim();
  const cookieLocation = await getLocationFromCookies();
  const city = sanitize(searchParams.get("city") || cookieLocation?.city || "");
  const locationKey = (city || "none").toLowerCase();
  const cacheKey = `${query.toLowerCase()}::${category.toLowerCase()}::${locationKey}`;

  if (!query) {
    return NextResponse.json({
      items: [],
      businesses: [],
      places: [],
      message: "empty query",
    });
  }

  if (!city) {
    return NextResponse.json({
      items: [],
      businesses: [],
      places: [],
      message: "missing_location",
    });
  }

  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      {
        error: "rate_limit_exceeded",
        message: "Too many search requests. Please wait a moment.",
      },
      { status: 429 }
    );
  }

  const cached = getCachedResponse(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  let supabase = null;
  try {
    supabase = await getSupabaseServerClient();
  } catch (err) {
    console.error("Failed to init Supabase client", err);
  }

  const [items, businesses, places] = await Promise.all([
    supabase ? searchListings(supabase, query, category, { city }) : [],
    supabase ? searchBusinesses(supabase, query, category, { city }) : [],
    searchMapboxPlaces(query),
  ]);

  const payload = {
    items,
    businesses,
    places,
  };

  setCachedResponse(cacheKey, payload);

  return NextResponse.json(payload);
}
