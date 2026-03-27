import {
  DEFAULT_RADIUS_KM,
  filterByLocation,
  getNormalizedLocation,
  hasUsableLocationFilter,
} from "@/lib/location/filter";

const VERIFIED_STATUSES = ["auto_verified", "manually_verified"];
const LOCATION_SELECT =
  "id,owner_user_id,public_id,business_name,category,city,state,postal_code,address,description,website,profile_photo_url,latitude,longitude,lat,lng,verification_status";

export async function findBusinessesForLocation(
  supabase,
  location,
  { limit = 1000, radiusKm = DEFAULT_RADIUS_KM } = {}
) {
  const normalizedLocation = getNormalizedLocation(location);
  if (!supabase || !hasUsableLocationFilter(normalizedLocation)) {
    return [];
  }

  const { data, error } = await supabase
    .from("businesses")
    .select(LOCATION_SELECT)
    .in("verification_status", VERIFIED_STATUSES)
    .limit(limit);

  if (error) {
    throw error;
  }

  return filterByLocation(data || [], normalizedLocation, { radiusKm });
}

export async function findBusinessOwnerIdsForLocation(supabase, location, options = {}) {
  const businesses = await findBusinessesForLocation(supabase, location, options);
  return Array.from(
    new Set(
      businesses
        .map((row) => row.owner_user_id || row.id || null)
        .filter(Boolean)
    )
  );
}
