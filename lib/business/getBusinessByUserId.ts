import { buildBusinessTaxonomyPayload } from "@/lib/taxonomy/compat";

export type BusinessVerificationStatus =
  | "pending"
  | "auto_verified"
  | "manually_verified"
  | "suspended";

export type UnifiedBusiness = {
  id: string;
  owner_user_id: string;
  business_row_id: string | null;
  source: "businesses" | "legacy";
  public_id: string | null;
  business_name: string | null;
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
  hours_json: Record<string, unknown> | null;
  social_links_json: Record<string, unknown> | null;
  role: string | null;
  is_internal: boolean;
  verification_status: BusinessVerificationStatus;
  stripe_connected: boolean;
  verified_at: string | null;
  risk_flags: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
};

type AnyClient = {
  from: (table: string) => any;
  auth?: {
    getUser?: () => Promise<{ data?: { user?: { id?: string | null } | null } | null }>;
  };
};

type GetBusinessByUserIdArgs = {
  client: AnyClient;
  userId: string;
  selfHeal?: boolean;
};

const BUSINESS_SELECT = [
  "id",
  "owner_user_id",
  "public_id",
  "business_name",
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
  "stripe_connected",
  "verified_at",
  "risk_flags",
  "created_at",
  "updated_at",
].join(",");

const USER_SELECT = [
  "id",
  "public_id",
  "role",
  "full_name",
  "business_name",
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
  "latitude",
  "longitude",
  "hours_json",
  "social_links_json",
  "is_internal",
  "created_at",
  "updated_at",
].join(",");

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeVerificationStatus(value: unknown): BusinessVerificationStatus {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "auto_verified") return "auto_verified";
  if (normalized === "manually_verified") return "manually_verified";
  if (normalized === "suspended") return "suspended";
  return "pending";
}

function canFallbackFromBusinesses(error: any): boolean {
  const code = String(error?.code || "").trim();
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    /relation .*businesses.* does not exist/i.test(String(error?.message || ""))
  );
}

function mapFromBusinesses(row: any, userRow: any | null): UnifiedBusiness {
  const taxonomy = buildBusinessTaxonomyPayload({
    business_type: row?.business_type ?? userRow?.business_type ?? null,
    category: row?.category ?? userRow?.category ?? null,
  });
  return {
    id: row?.owner_user_id || userRow?.id || "",
    owner_user_id: row?.owner_user_id || userRow?.id || "",
    business_row_id: row?.id || null,
    source: "businesses",
    public_id: row?.public_id ?? userRow?.public_id ?? null,
    business_name: row?.business_name ?? userRow?.business_name ?? null,
    business_type: taxonomy.business_type,
    full_name: userRow?.full_name ?? null,
    category: taxonomy.category,
    description: row?.description ?? userRow?.description ?? null,
    website: row?.website ?? userRow?.website ?? null,
    phone: row?.phone ?? null,
    profile_photo_url: row?.profile_photo_url ?? userRow?.profile_photo_url ?? null,
    cover_photo_url: row?.cover_photo_url ?? userRow?.cover_photo_url ?? null,
    address: row?.address ?? userRow?.address ?? null,
    address_2: row?.address_2 ?? userRow?.address_2 ?? null,
    city: row?.city ?? userRow?.city ?? null,
    state: row?.state ?? userRow?.state ?? null,
    postal_code: row?.postal_code ?? userRow?.postal_code ?? null,
    pickup_enabled_default: row?.pickup_enabled_default !== false,
    local_delivery_enabled_default: row?.local_delivery_enabled_default === true,
    default_delivery_fee_cents:
      typeof row?.default_delivery_fee_cents === "number"
        ? row.default_delivery_fee_cents
        : null,
    delivery_radius_miles:
      typeof row?.delivery_radius_miles === "number"
        ? row.delivery_radius_miles
        : null,
    delivery_min_order_cents:
      typeof row?.delivery_min_order_cents === "number"
        ? row.delivery_min_order_cents
        : null,
    delivery_notes:
      typeof row?.delivery_notes === "string" ? row.delivery_notes : null,
    latitude: row?.latitude ?? userRow?.latitude ?? null,
    longitude: row?.longitude ?? userRow?.longitude ?? null,
    hours_json: asRecord(row?.hours_json || userRow?.hours_json || null),
    social_links_json: asRecord(row?.social_links_json || userRow?.social_links_json || null),
    role: userRow?.role ?? null,
    is_internal: row?.is_internal === true,
    verification_status: normalizeVerificationStatus(row?.verification_status),
    stripe_connected: row?.stripe_connected === true,
    verified_at: row?.verified_at ?? null,
    risk_flags: asRecord(row?.risk_flags),
    created_at: row?.created_at ?? userRow?.created_at ?? null,
    updated_at: row?.updated_at ?? userRow?.updated_at ?? null,
  };
}

function mapFromLegacyUser(userRow: any): UnifiedBusiness {
  const taxonomy = buildBusinessTaxonomyPayload({
    business_type: userRow?.business_type ?? null,
    category: userRow?.category ?? null,
  });
  return {
    id: userRow?.id || "",
    owner_user_id: userRow?.id || "",
    business_row_id: null,
    source: "legacy",
    public_id: userRow?.public_id ?? null,
    business_name: userRow?.business_name ?? null,
    business_type: taxonomy.business_type,
    full_name: userRow?.full_name ?? null,
    category: taxonomy.category,
    description: userRow?.description ?? null,
    website: userRow?.website ?? null,
    phone: userRow?.phone ?? null,
    profile_photo_url: userRow?.profile_photo_url ?? null,
    cover_photo_url: userRow?.cover_photo_url ?? null,
    address: userRow?.address ?? null,
    address_2: userRow?.address_2 ?? null,
    city: userRow?.city ?? null,
    state: userRow?.state ?? null,
    postal_code: userRow?.postal_code ?? null,
    pickup_enabled_default: true,
    local_delivery_enabled_default: false,
    default_delivery_fee_cents: null,
    delivery_radius_miles: null,
    delivery_min_order_cents: null,
    delivery_notes: null,
    latitude: userRow?.latitude ?? null,
    longitude: userRow?.longitude ?? null,
    hours_json: asRecord(userRow?.hours_json),
    social_links_json: asRecord(userRow?.social_links_json),
    role: userRow?.role ?? null,
    is_internal: userRow?.is_internal === true,
    verification_status: "pending",
    stripe_connected: false,
    verified_at: null,
    risk_flags: {},
    created_at: userRow?.created_at ?? null,
    updated_at: userRow?.updated_at ?? null,
  };
}

async function shouldSelfHeal(client: AnyClient, userId: string): Promise<boolean> {
  if (!client?.auth?.getUser) return false;
  try {
    const userRes = await client.auth.getUser();
    const authUserId = userRes?.data?.user?.id || null;
    return Boolean(authUserId && authUserId === userId);
  } catch {
    return false;
  }
}

async function trySelfHealBusinessRow(client: AnyClient, business: UnifiedBusiness) {
  try {
    const taxonomy = buildBusinessTaxonomyPayload({
      business_type: business.business_type,
      category: business.category,
    });
    const upsertPayload: Record<string, unknown> = {
      owner_user_id: business.owner_user_id,
      business_name: business.business_name,
      business_type: taxonomy.business_type,
      category: taxonomy.category,
      description: business.description,
      website: business.website,
      phone: business.phone,
      profile_photo_url: business.profile_photo_url,
      cover_photo_url: business.cover_photo_url,
      address: business.address,
      address_2: business.address_2,
      city: business.city,
      state: business.state,
      postal_code: business.postal_code,
      latitude: business.latitude,
      longitude: business.longitude,
      hours_json: business.hours_json,
      social_links_json: business.social_links_json,
      is_internal: business.is_internal,
      verification_status: business.verification_status,
      stripe_connected: business.stripe_connected,
    };

    if (business.public_id) {
      upsertPayload.public_id = business.public_id;
    }

    await client.from("businesses").upsert(upsertPayload, {
      onConflict: "owner_user_id",
      ignoreDuplicates: false,
    });
  } catch {
    // Best-effort self-heal only.
  }
}

export async function getBusinessByUserId({
  client,
  userId,
  selfHeal = false,
}: GetBusinessByUserIdArgs): Promise<UnifiedBusiness | null> {
  const trimmedUserId = String(userId || "").trim();
  if (!client || !trimmedUserId) return null;

  const businessRes = await client
    .from("businesses")
    .select(BUSINESS_SELECT)
    .eq("owner_user_id", trimmedUserId)
    .maybeSingle();

  const canSilenceBusinessesError = businessRes.error
    ? canFallbackFromBusinesses(businessRes.error)
    : true;

  if (!businessRes.error && businessRes.data) {
    const userRes = await client
      .from("users")
      .select("id,public_id,role,full_name,business_name,category,description,website,phone,profile_photo_url,cover_photo_url,address,address_2,city,state,postal_code,latitude,longitude,hours_json,social_links_json,is_internal,created_at,updated_at")
      .eq("id", trimmedUserId)
      .maybeSingle();

    return mapFromBusinesses(businessRes.data, userRes.data || null);
  }

  if (businessRes.error && !canSilenceBusinessesError) {
    console.error("[business] businesses lookup failed", {
      code: businessRes.error?.code || null,
      message: businessRes.error?.message || null,
      userId: trimmedUserId,
    });
  }

  const userRes = await client
    .from("users")
    .select(USER_SELECT)
    .eq("id", trimmedUserId)
    .maybeSingle();

  if (userRes.error || !userRes.data) {
    if (userRes.error) {
      console.error("[business] users fallback lookup failed", {
        code: userRes.error?.code || null,
        message: userRes.error?.message || null,
        userId: trimmedUserId,
      });
    }
    return null;
  }

  const legacyBusiness = mapFromLegacyUser(userRes.data);
  console.warn("[monitor] legacy_business_users_fallback", {
    helper: "getBusinessByUserId",
    userId: trimmedUserId,
  });

  if (selfHeal && (await shouldSelfHeal(client, trimmedUserId))) {
    await trySelfHealBusinessRow(client, legacyBusiness);
  }

  return legacyBusiness;
}

// Private/business-dashboard only. Do not use on public-facing routes.
export const getBusinessForOwnerWithFallback = getBusinessByUserId;

export default getBusinessByUserId;
