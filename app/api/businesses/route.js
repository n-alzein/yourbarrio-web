import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

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
    const response = NextResponse.next();
    const supabase = createSupabaseRouteHandlerClient(req, response);
    if (!supabase) {
      return NextResponse.json(
        { error: "Server is missing Supabase credentials" },
        { status: 500 }
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
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

    const trimmedName = String(name || "").trim();
    const trimmedCategory = String(category || "").trim();
    if (!trimmedName || !trimmedCategory) {
      return NextResponse.json(
        { error: "Business name and category are required" },
        { status: 400 }
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

    const rpcPayload = {
      name: trimmedName,
      category: trimmedCategory,
      description: description || "",
      address: address || "",
      address_2: address_2 || "",
      city: city || "",
      state: state || "",
      postal_code: postal_code || "",
      phone: phone || "",
      website: normalizedWebsite || "",
      latitude: geo?.lat ?? null,
      longitude: geo?.lng ?? null,
    };

    const { data, error } = await supabase.rpc("create_business_from_onboarding", {
      p_payload: rpcPayload,
    });

    if (error) {
      console.error("create_business_from_onboarding failed", error);
      return NextResponse.json(
        { error: error.message || "Failed to create business profile" },
        { status: 400 }
      );
    }

    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json(
      {
        id: row?.business_id || null,
        public_id: row?.public_id || null,
        geo,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Business create API error", err);
    return NextResponse.json(
      { error: err?.message || "Unexpected server error" },
      { status: 500 }
    );
  }
}
