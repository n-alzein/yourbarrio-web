import { buildBusinessTaxonomyPayload } from "@/lib/taxonomy/compat";

export const PUBLIC_VERIFIED_BUSINESS_STATUSES = ["auto_verified", "manually_verified"];

export const PUBLIC_BUSINESS_SELECT = [
  "id",
  "owner_user_id",
  "account_status",
  "deleted_at",
  "public_id",
  "business_name",
  "business_type_id",
  "business_type",
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
  "pickup_enabled_default",
  "local_delivery_enabled_default",
  "default_delivery_fee_cents",
  "delivery_radius_miles",
  "delivery_min_order_cents",
  "delivery_notes",
  "latitude",
  "longitude",
  "hours_json",
  "social_links_json",
  "is_internal",
  "verification_status",
].join(",");

export type PublicBusiness = {
  id: string;
  owner_user_id: string;
  business_row_id: string;
  account_status?: string | null;
  deleted_at?: string | null;
  public_id: string | null;
  business_name: string | null;
  business_type_id: string | null;
  business_type: string | null;
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
  pickup_enabled_default: boolean;
  local_delivery_enabled_default: boolean;
  default_delivery_fee_cents: number | null;
  delivery_radius_miles: number | null;
  delivery_min_order_cents: number | null;
  delivery_notes: string | null;
  latitude: number | null;
  longitude: number | null;
  hours_json: Record<string, unknown>;
  social_links_json: Record<string, unknown>;
  is_internal: boolean;
  verification_status: string;
};

export type PublicBusinessRow = {
  id: string;
  owner_user_id: string;
  account_status?: string | null;
  deleted_at?: string | null;
  public_id: string | null;
  business_name: string | null;
  business_type_id: string | null;
  business_type: string | null;
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
  pickup_enabled_default: boolean | null;
  local_delivery_enabled_default: boolean | null;
  default_delivery_fee_cents: number | null;
  delivery_radius_miles: number | null;
  delivery_min_order_cents: number | null;
  delivery_notes: string | null;
  latitude: number | null;
  longitude: number | null;
  hours_json: unknown;
  social_links_json: unknown;
  is_internal: boolean | null;
  verification_status: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function applyPublicBusinessVisibility(query: any, options: { viewerCanSeeInternalContent?: boolean } = {}) {
  let nextQuery = query
    .in("verification_status", PUBLIC_VERIFIED_BUSINESS_STATUSES)
    .eq("account_status", "active")
    .is("deleted_at", null);

  if (options.viewerCanSeeInternalContent !== true) {
    nextQuery = nextQuery.eq("is_internal", false);
  }

  return nextQuery;
}

export function mapPublicBusinessRow(data: PublicBusinessRow): PublicBusiness {
  const taxonomy = buildBusinessTaxonomyPayload({
    business_type: data.business_type,
    category: data.category,
  });

  return {
    id: data.owner_user_id,
    owner_user_id: data.owner_user_id,
    business_row_id: data.id,
    account_status: data.account_status ?? null,
    deleted_at: data.deleted_at ?? null,
    public_id: data.public_id ?? null,
    business_name: data.business_name ?? null,
    business_type_id: data.business_type_id ?? null,
    business_type: taxonomy.business_type,
    full_name: null,
    category: taxonomy.category,
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
    pickup_enabled_default: data.pickup_enabled_default !== false,
    local_delivery_enabled_default: data.local_delivery_enabled_default === true,
    default_delivery_fee_cents: data.default_delivery_fee_cents ?? null,
    delivery_radius_miles: data.delivery_radius_miles ?? null,
    delivery_min_order_cents: data.delivery_min_order_cents ?? null,
    delivery_notes: data.delivery_notes ?? null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    hours_json: asRecord(data.hours_json),
    social_links_json: asRecord(data.social_links_json),
    is_internal: data.is_internal === true,
    verification_status: String(data.verification_status || "pending"),
  };
}
