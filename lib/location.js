import {
  LEGACY_CITY_KEY,
  LOCATION_COOKIE_NAME,
  LOCATION_STORAGE_KEY,
} from "@/lib/location/locationCookie";
import {
  buildLocationLabel,
  getLocationCacheKey,
  getNormalizedLocation,
  hasUsableLocationFilter,
  normalizeStateCode,
} from "@/lib/location/filter";

const ZIP_REGEX = /\b\d{5}(?:-\d{4})?\b/;

export { LOCATION_STORAGE_KEY, LEGACY_CITY_KEY, LOCATION_COOKIE_NAME };

const compactSpaces = (value) => (value || "").replace(/\s+/g, " ").trim();

export const isZipLike = (value) => ZIP_REGEX.test(compactSpaces(value));

export const normalizeLocationInput = (value) => {
  const compacted = compactSpaces(value);
  if (!compacted) {
    return { city: null, zip: null };
  }
  const zipMatch = compacted.match(ZIP_REGEX);
  if (zipMatch) {
    return { city: null, zip: zipMatch[0] };
  }
  return { city: compacted, zip: null };
};

const normalizeNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const extractCityFromLabel = (label) => {
  if (typeof label !== "string") return null;
  const withoutZip = label.replace(ZIP_REGEX, "");
  const normalized = withoutZip.replace(/[-\u2014]/g, ",");
  const parts = normalized
    .split(",")
    .map((part) => compactSpaces(part))
    .filter(Boolean);
  return parts[0] || null;
};

export const normalizeLocation = (location = {}) => {
  const source =
    location.source === "ip" || location.source === "gps" || location.source === "manual"
      ? location.source
      : null;
  const rawCity = compactSpaces(location.city);
  const rawRegion = normalizeStateCode(location.region ?? location.state);
  const rawCountry = compactSpaces(location.country);
  const rawZip = compactSpaces(location.zip);
  const city = rawCity || null;
  const region = rawRegion || null;
  const country = rawCountry || null;
  const zip = city ? null : rawZip || null;
  const lat = normalizeNumber(location.lat);
  const lng = normalizeNumber(location.lng);
  const label = compactSpaces(location.label) || null;
  const placeId = compactSpaces(location.placeId || location.place_id) || null;
  const kind = location.kind === "postcode" || location.kind === "place" ? location.kind : null;
  const updatedAt = Number.isFinite(Number(location.updatedAt))
    ? Number(location.updatedAt)
    : null;
  return {
    source,
    city,
    region,
    country,
    zip,
    lat,
    lng,
    label,
    placeId,
    place_id: placeId,
    kind,
    updatedAt,
  };
};

export const hasLocation = (location) =>
  hasUsableLocationFilter(location);

export const isSameLocation = (a, b) => {
  const left = getNormalizedLocation(normalizeLocation(a));
  const right = getNormalizedLocation(normalizeLocation(b));
  return (
    left.city === right.city &&
    left.region === right.region &&
    left.zip === right.zip &&
    left.lat === right.lat &&
    left.lng === right.lng
  );
};

export const getLocationLabel = (location) =>
  buildLocationLabel(location?.city, location?.region ?? location?.state, location?.label) ||
  location?.zip ||
  "Set location";

export { buildLocationLabel, getLocationCacheKey, hasUsableLocationFilter, normalizeStateCode };

export const normalizeSelectedLocation = (suggestion) => {
  if (!suggestion) return normalizeLocation({});
  const kind = suggestion.kind === "postcode" ? "postcode" : "place";
  const context = suggestion.context || {};
  const city =
    compactSpaces(suggestion.city) ||
    compactSpaces(context.city) ||
    extractCityFromLabel(suggestion.label) ||
    null;
  const regionCode = normalizeStateCode(context.region_code || suggestion.region_code || "");
  const regionLabel =
    regionCode ||
    normalizeStateCode(suggestion.state || suggestion.region || context.region) ||
    null;
  const label =
    buildLocationLabel(city, regionLabel) ||
    compactSpaces(suggestion.label) ||
    null;
  const center = suggestion.center || {};
  const lat = normalizeNumber(center.lat);
  const lng = normalizeNumber(center.lng);
  return normalizeLocation({
    source: "manual",
    city,
    region: regionLabel,
    lat,
    lng,
    label,
    placeId: suggestion.place_id || suggestion.id,
    kind,
    updatedAt: Date.now(),
  });
};

export const getLocationFromSearchParams = (params) => {
  if (!params?.get) {
    return normalizeLocation({});
  }
  const city = params.get("city") || "";
  const region = params.get("state") || params.get("region") || "";
  const zip = params.get("zip") || "";
  const lat = params.get("lat") || "";
  const lng = params.get("lng") || "";
  return normalizeLocation({ city, region, zip, lat, lng });
};

export const setLocationSearchParams = (params, location) => {
  const next = new URLSearchParams(
    typeof params?.toString === "function" ? params.toString() : params || ""
  );
  const normalized = normalizeLocation(location);
  if (normalized.city && normalized.region) {
    next.set("city", normalized.city);
    next.set("state", normalized.region);
    next.delete("zip");
  } else if (normalized.zip) {
    next.set("zip", normalized.zip);
    next.delete("city");
    next.delete("state");
  } else {
    next.delete("city");
    next.delete("state");
    next.delete("zip");
  }
  return next;
};

export const withLocationHref = (href, location) => {
  const [path, query = ""] = (href || "").split("?");
  const params = setLocationSearchParams(new URLSearchParams(query), location);
  const next = params.toString();
  return next ? `${path}?${next}` : path;
};
