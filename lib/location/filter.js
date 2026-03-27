const DEFAULT_RADIUS_KM = 25;

const STATE_ENTRIES = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
  ["DC", "District of Columbia"],
];

const STATE_NAME_TO_CODE = new Map();
for (const [code, name] of STATE_ENTRIES) {
  STATE_NAME_TO_CODE.set(code, code);
  STATE_NAME_TO_CODE.set(name.toLowerCase(), code);
}

const compactSpaces = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const normalizeNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const normalizeLocationText = (value) => {
  const compacted = compactSpaces(value);
  return compacted ? compacted.toLowerCase() : null;
};

export const normalizeStateCode = (value) => {
  const compacted = compactSpaces(value);
  if (!compacted) return null;

  const parts = compacted.split("-");
  const candidate = parts[parts.length - 1] || compacted;
  const upper = candidate.toUpperCase();
  if (STATE_NAME_TO_CODE.has(upper)) {
    return STATE_NAME_TO_CODE.get(upper) || null;
  }

  const byName = STATE_NAME_TO_CODE.get(candidate.toLowerCase());
  if (byName) return byName;

  if (/^[A-Z]{2}$/.test(upper)) return upper;
  return null;
};

export const buildLocationLabel = (city, state, fallbackLabel = null) => {
  const safeCity = compactSpaces(city);
  const safeState = normalizeStateCode(state);
  if (safeCity && safeState) return `${safeCity}, ${safeState}`;
  if (safeCity) return safeCity;
  const safeLabel = compactSpaces(fallbackLabel);
  return safeLabel || null;
};

export const getNormalizedLocation = (location = {}) => {
  const city = compactSpaces(location.city) || null;
  const state = normalizeStateCode(location.state ?? location.region ?? location.state_code);
  const lat = normalizeNumber(
    location.lat ?? location.latitude ?? location.location_lat ?? location.center?.lat
  );
  const lng = normalizeNumber(
    location.lng ?? location.longitude ?? location.location_lng ?? location.center?.lng
  );

  return {
    ...location,
    city,
    region: state,
    state,
    lat,
    lng,
    label: buildLocationLabel(city, state, location.label),
  };
};

export const hasCoordinates = (location) => {
  const normalized = getNormalizedLocation(location);
  return Number.isFinite(normalized.lat) && Number.isFinite(normalized.lng);
};

export const hasCityState = (location) => {
  const normalized = getNormalizedLocation(location);
  return Boolean(normalized.city && normalized.state);
};

export const hasUsableLocationFilter = (location) => {
  const normalized = getNormalizedLocation(location);
  return hasCoordinates(normalized) || hasCityState(normalized);
};

export const getLocationCacheKey = (location) => {
  const normalized = getNormalizedLocation(location);
  if (hasCoordinates(normalized)) {
    return `coords:${normalized.lat.toFixed(4)},${normalized.lng.toFixed(4)}`;
  }
  if (hasCityState(normalized)) {
    return `citystate:${normalizeLocationText(normalized.city)}:${normalized.state}`;
  }
  return "none";
};

export const getCandidateCoordinates = (candidate = {}) => {
  const lat = normalizeNumber(
    candidate.lat ?? candidate.latitude ?? candidate.location_lat ?? candidate.coords?.lat
  );
  const lng = normalizeNumber(
    candidate.lng ?? candidate.longitude ?? candidate.location_lng ?? candidate.coords?.lng
  );
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

export const matchesExactCityState = (candidate, selectedLocation) => {
  const selected = getNormalizedLocation(selectedLocation);
  if (!hasCityState(selected)) return false;

  return (
    normalizeLocationText(candidate?.city) === normalizeLocationText(selected.city) &&
    normalizeStateCode(candidate?.state ?? candidate?.region ?? candidate?.state_code) ===
      selected.state
  );
};

const toRadians = (degrees) => (degrees * Math.PI) / 180;

export const haversineDistanceKm = (a, b) => {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

export const matchesLocationCandidate = (
  candidate,
  selectedLocation,
  { radiusKm = DEFAULT_RADIUS_KM } = {}
) => {
  const selected = getNormalizedLocation(selectedLocation);
  const selectedHasCoords = hasCoordinates(selected);
  const candidateCoords = getCandidateCoordinates(candidate);
  const candidateHasCoords = Boolean(candidateCoords);

  if (selectedHasCoords && candidateHasCoords) {
    return haversineDistanceKm(candidateCoords, selected) <= radiusKm;
  }

  return matchesExactCityState(candidate, selected);
};

export const filterByLocation = (rows, selectedLocation, options = {}) => {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => matchesLocationCandidate(row, selectedLocation, options));
};

export { DEFAULT_RADIUS_KM };
