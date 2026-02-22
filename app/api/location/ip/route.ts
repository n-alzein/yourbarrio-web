import { headers } from "next/headers";
import { decodeHumanLocationString } from "@/lib/location/decodeHumanLocation";

export const dynamic = "force-dynamic";

type GeoLike = {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

const toNumber = (value: string | null) => {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function GET(request: Request & { geo?: GeoLike }) {
  const h = await headers();
  const geo = request?.geo || {};

  // Header-based edge geo lookup. If unavailable, return null fields without failing.
  const city =
    decodeHumanLocationString(h.get("x-vercel-ip-city")) ||
    decodeHumanLocationString(h.get("cf-ipcity")) ||
    decodeHumanLocationString(h.get("x-appengine-city")) ||
    decodeHumanLocationString(geo.city);
  const region =
    decodeHumanLocationString(h.get("x-vercel-ip-country-region")) ||
    decodeHumanLocationString(h.get("cf-region-code")) ||
    decodeHumanLocationString(h.get("x-appengine-region")) ||
    decodeHumanLocationString(geo.region);
  const country =
    decodeHumanLocationString(h.get("x-vercel-ip-country")) ||
    decodeHumanLocationString(h.get("cf-ipcountry")) ||
    decodeHumanLocationString(h.get("x-appengine-country")) ||
    decodeHumanLocationString(geo.country);
  const lat =
    toNumber(h.get("x-vercel-ip-latitude")) ||
    toNumber(h.get("cf-iplatitude")) ||
    toNumber(geo.latitude != null ? String(geo.latitude) : null) ||
    null;
  const lng =
    toNumber(h.get("x-vercel-ip-longitude")) ||
    toNumber(h.get("cf-iplongitude")) ||
    toNumber(geo.longitude != null ? String(geo.longitude) : null) ||
    null;

  return Response.json({
    source: "ip",
    city,
    region,
    country,
    lat,
    lng,
  });
}
