import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function normalizeWebsite(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

function buildAddressForGeocode({ address, address_2, city, state, postal_code }) {
  return [address, address_2, city, state, postal_code]
    .map((value) => (value || "").trim())
    .filter(Boolean)
    .join(", ");
}

async function geocodeAddress(address) {
  const key = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!key || !address) return null;

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    address
  )}&key=${key}`;

  const res = await fetch(url);
  if (!res.ok) {
    console.warn("Geocode request failed:", res.status);
    return null;
  }

  const data = await res.json();
  const loc = data?.results?.[0]?.geometry?.location;
  if (!loc?.lat || !loc?.lng) return null;
  return { lat: loc.lat, lng: loc.lng };
}

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      userId,
      name,
      category,
      description,
      address,
      address_2,
      city,
      state,
      postal_code,
      phone,
      website,
      latitude,
      longitude,
    } = body || {};

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server is missing Supabase credentials" },
        { status: 500 }
      );
    }

    const normalizedWebsite = normalizeWebsite(website);
    const addressForGeocode = buildAddressForGeocode({
      address,
      address_2,
      city,
      state,
      postal_code,
    });

    const prefilledGeo =
      typeof latitude === "number" && typeof longitude === "number"
        ? { lat: latitude, lng: longitude }
        : null;
    const geo = prefilledGeo || (await geocodeAddress(addressForGeocode));

    const payload = {
      id: userId,
      role: "business",
      business_name: name,
      full_name: name,
      category,
      description,
      address,
      address_2,
      city,
      state,
      postal_code,
      phone,
      website: normalizedWebsite,
      latitude: geo?.lat ?? null,
      longitude: geo?.lng ?? null,
    };

    const { data, error } = await supabase
      .from("users")
      .upsert(payload, { onConflict: "id" })
      .select("id, public_id")
      .single();

    if (error) {
      console.error("Business upsert failed", error);
      return NextResponse.json(
        { error: error.message || "Upsert failed" },
        { status: 400 }
      );
    }

    return NextResponse.json({ id: data.id, public_id: data.public_id || null, geo });
  } catch (err) {
    console.error("Business create API error", err);
    return NextResponse.json(
      { error: err?.message || "Unexpected server error" },
      { status: 500 }
    );
  }
}
