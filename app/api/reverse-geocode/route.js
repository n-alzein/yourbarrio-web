import { NextResponse } from "next/server";

const MAPBOX_TOKEN = process.env.MAPBOX_GEOCODING_TOKEN || "";

const pickContextText = (contexts, prefix) => {
  const match = contexts.find((item) => item?.id?.startsWith(prefix));
  return match?.text || "";
};

const pickRegionCode = (contexts) => {
  const match = contexts.find((item) => item?.id?.startsWith("region."));
  const shortCode = String(match?.short_code || "").trim();
  if (!shortCode) return "";
  const parts = shortCode.split("-");
  return (parts[parts.length - 1] || "").toUpperCase();
};

const parseCity = (feature) => {
  if (!feature) return "";
  if (feature.place_type?.includes("place")) return feature.text || "";
  if (feature.place_type?.includes("locality")) return feature.text || "";
  const contexts = feature.context || [];
  return (
    pickContextText(contexts, "place") ||
    pickContextText(contexts, "locality") ||
    pickContextText(contexts, "district") ||
    pickContextText(contexts, "region") ||
    ""
  );
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = Number.parseFloat(searchParams.get("lat"));
  const lng = Number.parseFloat(searchParams.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "invalid_coordinates" }, { status: 400 });
  }

  if (!MAPBOX_TOKEN) {
    return NextResponse.json({ error: "geocode_token_missing" }, { status: 500 });
  }

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    `${lng},${lat}`
  )}.json?types=place,locality&limit=1&access_token=${MAPBOX_TOKEN}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return NextResponse.json(
        { error: "geocode_failed", detail: txt },
        { status: res.status }
      );
    }
    const data = await res.json();
    if (!data?.features?.length) {
      return NextResponse.json({ city: "", region: "" }, { status: 200 });
    }
    const city = parseCity(data.features[0]);
    const region = pickRegionCode(data.features[0]?.context || []);
    return NextResponse.json({ city, region });
  } catch (err) {
    return NextResponse.json(
      { error: "geocode_error", detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}
