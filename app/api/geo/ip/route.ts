import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const compact = (value: string | null) => {
  const next = (value || "").trim();
  return next || null;
};

const toNumber = (value: string | null) => {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function GET() {
  const h = await headers();

  const city =
    compact(h.get("x-vercel-ip-city")) ||
    compact(h.get("cf-ipcity")) ||
    compact(h.get("x-appengine-city"));
  const region =
    compact(h.get("x-vercel-ip-country-region")) ||
    compact(h.get("cf-region-code")) ||
    compact(h.get("x-appengine-region"));
  const country =
    compact(h.get("x-vercel-ip-country")) ||
    compact(h.get("cf-ipcountry")) ||
    compact(h.get("x-appengine-country"));
  const lat =
    toNumber(h.get("x-vercel-ip-latitude")) ||
    toNumber(h.get("cf-iplatitude")) ||
    null;
  const lng =
    toNumber(h.get("x-vercel-ip-longitude")) ||
    toNumber(h.get("cf-iplongitude")) ||
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

