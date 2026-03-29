import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { findBusinessesForLocation } from "@/lib/location/businessLocationSearch";
import { getNormalizedLocation, hasUsableLocationFilter } from "@/lib/location/filter";
import { getBusinessTypeLabel } from "@/lib/taxonomy/compat";

const CACHE_SECONDS = 120;
const GEOCODE_KEY = process.env.MAPBOX_GEOCODING_TOKEN || process.env.GOOGLE_GEOCODING_API_KEY || "";
const VERIFIED_STATUSES = ["auto_verified", "manually_verified"];

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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const location = getNormalizedLocation({
      city: searchParams.get("city"),
      region: searchParams.get("state") || searchParams.get("region"),
      lat: searchParams.get("lat"),
      lng: searchParams.get("lng"),
    });

    if (!hasUsableLocationFilter(location)) {
      return NextResponse.json({ businesses: [], message: "missing_location" }, { status: 200 });
    }

    const supabase = await createSupabaseClient();
    const rows = await findBusinessesForLocation(supabase, location, { limit: 1000 });

    const parseNum = (val) => {
      if (typeof val === "number" && Number.isFinite(val)) return val;
      const parsed = parseFloat(val);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const businesses = await Promise.all(
      rows.map(async (row) => {
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
            category: getBusinessTypeLabel(row, row.category || "Local business"),
            latitude: lat,
            longitude: lng,
            lat,
            lng,
            source: "supabase_businesses",
          };
        }

        const addressParts = [row.address, row.city, row.state].filter(Boolean).join(", ");
        const coords = GEOCODE_KEY ? await geocodeAddress(addressParts) : null;

        return {
          ...row,
          id: row.owner_user_id,
          category: getBusinessTypeLabel(row, row.category || "Local business"),
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          source: "supabase_businesses",
        };
      })
    );

    const resp = NextResponse.json(
      { businesses },
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
