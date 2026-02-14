import { getPublicSupabaseServerClient } from "@/lib/supabasePublicServer";

const UUID_ANY_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PUBLIC_BUSINESS_SELECT = [
  "id",
  "owner_user_id",
  "public_id",
  "business_name",
  "category",
  "description",
  "website",
  "phone",
  "profile_photo_url",
  "cover_photo_url",
  "address",
  "address_2",
  "city",
  "state",
  "postal_code",
  "latitude",
  "longitude",
  "hours_json",
  "social_links_json",
  "verification_status",
].join(",");

export type PublicBusiness = {
  id: string;
  owner_user_id: string;
  business_row_id: string;
  public_id: string | null;
  business_name: string | null;
  full_name: string | null;
  category: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  profile_photo_url: string | null;
  cover_photo_url: string | null;
  address: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  hours_json: Record<string, unknown>;
  social_links_json: Record<string, unknown>;
  verification_status: string;
};

type PublicBusinessRow = {
  id: string;
  owner_user_id: string;
  public_id: string | null;
  business_name: string | null;
  category: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  profile_photo_url: string | null;
  cover_photo_url: string | null;
  address: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  hours_json: unknown;
  social_links_json: unknown;
  verification_status: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function getPublicBusinessByOwnerId(
  ownerUserId: string
): Promise<PublicBusiness | null> {
  const trimmedOwnerUserId = String(ownerUserId || "").trim();
  if (!trimmedOwnerUserId || !UUID_ANY_RE.test(trimmedOwnerUserId)) return null;

  const supabase = getPublicSupabaseServerClient();
  const { data, error } = await supabase
    .from("businesses")
    .select(PUBLIC_BUSINESS_SELECT)
    .eq("owner_user_id", trimmedOwnerUserId)
    .maybeSingle<PublicBusinessRow>();

  if (error) {
    console.warn("[public-business] businesses lookup failed", {
      ownerUserId: trimmedOwnerUserId,
      code: error.code || null,
      message: error.message || null,
    });
    return null;
  }

  if (!data) return null;

  return {
    id: data.owner_user_id,
    owner_user_id: data.owner_user_id,
    business_row_id: data.id,
    public_id: data.public_id ?? null,
    business_name: data.business_name ?? null,
    full_name: null,
    category: data.category ?? null,
    description: data.description ?? null,
    website: data.website ?? null,
    phone: data.phone ?? null,
    profile_photo_url: data.profile_photo_url ?? null,
    cover_photo_url: data.cover_photo_url ?? null,
    address: data.address ?? null,
    address_2: data.address_2 ?? null,
    city: data.city ?? null,
    state: data.state ?? null,
    postal_code: data.postal_code ?? null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    hours_json: asRecord(data.hours_json),
    social_links_json: asRecord(data.social_links_json),
    verification_status: String(data.verification_status || "pending"),
  };
}

export default getPublicBusinessByOwnerId;
