import {
  LEGACY_CITY_KEY,
  LOCATION_COOKIE_NAME,
  LOCATION_STORAGE_KEY,
} from "@/lib/location/locationCookie";

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

const normalizeRegionCode = (value) => {
  const compacted = compactSpaces(value).toLowerCase();
  if (!compacted) return null;
  const parts = compacted.split("-");
  const tail = parts[parts.length - 1] || "";
  return tail ? tail.toUpperCase() : null;
};

const formatLocationLabel = (city, region) => {
  if (!city) return null;
  return region ? `${city}, ${region}` : city;
};

export const normalizeLocation = (location = {}) => {
  const rawCity = compactSpaces(location.city);
  const rawZip = compactSpaces(location.zip);
  const city = rawCity || null;
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
    city,
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
  Boolean(location?.city);

export const isSameLocation = (a, b) => {
  const left = normalizeLocation(a);
  const right = normalizeLocation(b);
  return (
    left.city === right.city &&
    left.zip === right.zip &&
    left.lat === right.lat &&
    left.lng === right.lng
  );
};

export const getLocationLabel = (location) =>
  location?.city || location?.label || location?.zip || "Your city";

export const normalizeSelectedLocation = (suggestion) => {
  if (!suggestion) return normalizeLocation({});
  const kind = suggestion.kind === "postcode" ? "postcode" : "place";
  const context = suggestion.context || {};
  const city =
    compactSpaces(suggestion.city) ||
    compactSpaces(context.city) ||
    extractCityFromLabel(suggestion.label) ||
    null;
  const regionCode = normalizeRegionCode(context.region_code || suggestion.region_code || "");
  const regionLabel =
    regionCode ||
    compactSpaces(suggestion.state || suggestion.region) ||
    compactSpaces(context.region) ||
    null;
  const label =
    formatLocationLabel(city, regionLabel) ||
    compactSpaces(suggestion.label) ||
    null;
  const center = suggestion.center || {};
  const lat = normalizeNumber(center.lat);
  const lng = normalizeNumber(center.lng);
  return normalizeLocation({
    city,
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
  const zip = params.get("zip") || "";
  return normalizeLocation({ city, zip });
};

export const setLocationSearchParams = (params, location) => {
  const next = new URLSearchParams(
    typeof params?.toString === "function" ? params.toString() : params || ""
  );
  const normalized = normalizeLocation(location);
  if (normalized.zip) {
    next.set("zip", normalized.zip);
    next.delete("city");
  } else if (normalized.city) {
    next.set("city", normalized.city);
    next.delete("zip");
  } else {
    next.delete("city");
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
