import {
  DEFAULT_RADIUS_KM,
  filterByLocation,
  getNormalizedLocation,
  hasUsableLocationFilter,
} from "@/lib/location/filter";
import { PUBLIC_VERIFIED_BUSINESS_STATUSES } from "@/lib/business/publicBusinessQuery";

const LOCATION_SELECT =
  "id,owner_user_id,public_id,business_name,business_type_id,business_type,category,city,state,postal_code,address,description,website,profile_photo_url,cover_photo_url,latitude,longitude,lat,lng,verification_status,account_status,deleted_at,created_at,updated_at,is_seeded";

export async function findBusinessesForLocation(
  supabase,
  location,
  { limit = 1000, radiusKm = DEFAULT_RADIUS_KM, viewerCanSeeInternalContent = false } = {}
) {
  const normalizedLocation = getNormalizedLocation(location);
  if (!supabase || !hasUsableLocationFilter(normalizedLocation)) {
    return [];
  }

  let query = supabase
    .from("businesses")
    .select(LOCATION_SELECT)
    .in("verification_status", PUBLIC_VERIFIED_BUSINESS_STATUSES)
    .eq("account_status", "active")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false, nullsFirst: false });

  if (!viewerCanSeeInternalContent) {
    query = query.eq("is_internal", false);
  }

  const { data, error } = await query.limit(limit);

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
