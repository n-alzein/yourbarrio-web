import "server-only";

import { unstable_cache } from "next/cache";
import { logAdminAction } from "@/lib/admin/audit";
import { requireAdminRole } from "@/lib/admin/permissions";
import { getAdminDataClient } from "@/lib/supabase/admin";

export type BusinessVerificationStatus =
  | "pending"
  | "auto_verified"
  | "manually_verified"
  | "suspended";

export type VerificationQueueStatus = BusinessVerificationStatus | "verified" | "all";

export type PendingVerificationFilters = {
  q?: string;
  city?: string;
  is_internal?: boolean;
  from?: number;
  to?: number;
  status?: VerificationQueueStatus;
};

export type PendingBusinessVerificationRow = {
  owner_user_id: string;
  public_id: string | null;
  business_name: string | null;
  category: string | null;
  city: string | null;
  created_at: string | null;
  verification_status: BusinessVerificationStatus;
  stripe_connected: boolean;
  is_internal: boolean;
  risk_flags: Record<string, unknown>;
  owner_email: string | null;
};

export type SetBusinessVerificationStatusParams = {
  owner_user_id: string;
  next_status: "manually_verified" | "suspended" | "pending";
};

export const PENDING_VERIFICATION_COUNT_CACHE_TAG = "admin_business_verification_pending_count";

function normalizeStatus(value: unknown): BusinessVerificationStatus {
  const status = String(value || "").trim().toLowerCase();
  if (status === "auto_verified") return "auto_verified";
  if (status === "manually_verified") return "manually_verified";
  if (status === "suspended") return "suspended";
  return "pending";
}

function sanitizeSearchTerm(value: string): string {
  return value.replace(/[%(),]/g, " ").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function countPendingFromClient(client: any): Promise<number> {
  const { count, error } = await client
    .from("businesses")
    .select("owner_user_id", { count: "exact", head: true })
    .eq("verification_status", "pending");

  if (error) {
    throw new Error(error.message || "Failed to count pending business verifications");
  }

  return Number(count || 0);
}

const getPendingVerificationCountCached = unstable_cache(
  async () => {
    const { client } = await getAdminDataClient({ mode: "service" });
    return countPendingFromClient(client);
  },
  ["admin-business-verification-pending-count"],
  { revalidate: 45, tags: [PENDING_VERIFICATION_COUNT_CACHE_TAG] }
);

export async function getCachedPendingBusinessVerificationsCount(): Promise<number> {
  await requireAdminRole("admin_readonly");
  return getPendingVerificationCountCached();
}

export async function countPendingBusinessVerifications(): Promise<number> {
  await requireAdminRole("admin_readonly");
  const { client } = await getAdminDataClient({ mode: "service" });
  return countPendingFromClient(client);
}

export async function listPendingBusinessVerifications({
  q = "",
  city = "",
  is_internal,
  from = 0,
  to = 49,
  status = "pending",
}: PendingVerificationFilters): Promise<{ rows: PendingBusinessVerificationRow[]; total_count: number }> {
  await requireAdminRole("admin_readonly");
  const { client } = await getAdminDataClient({ mode: "service" });

  let query = client
    .from("businesses")
    .select(
      "owner_user_id, public_id, business_name, category, city, created_at, verification_status, stripe_connected, is_internal, risk_flags",
      {
        count: "exact",
      }
    )
    .order("created_at", { ascending: false });

  if (status === "verified") {
    query = query.in("verification_status", ["auto_verified", "manually_verified"]);
  } else if (status !== "all") {
    query = query.eq("verification_status", status);
  }

  const cityFilter = String(city || "").trim();
  if (cityFilter) {
    query = query.ilike("city", `%${cityFilter}%`);
  }

  if (typeof is_internal === "boolean") {
    query = query.eq("is_internal", is_internal);
  }

  const search = sanitizeSearchTerm(String(q || ""));
  if (search) {
    const { data: emailRows } = await client
      .from("users")
      .select("id")
      .ilike("email", `%${search}%`)
      .limit(5000);

    const ownerIds = (Array.isArray(emailRows) ? emailRows : [])
      .map((row: any) => String(row?.id || "").trim())
      .filter(Boolean);

    const clauses = [
      `business_name.ilike.%${search}%`,
      `category.ilike.%${search}%`,
      `city.ilike.%${search}%`,
      `public_id.ilike.%${search}%`,
    ];
    if (ownerIds.length) {
      clauses.push(`owner_user_id.in.(${ownerIds.join(",")})`);
    }
    query = query.or(clauses.join(","));
  }

  const { data, count, error } = await query.range(Math.max(0, from), Math.max(Math.max(0, from), to));
  if (error) {
    throw new Error(error.message || "Failed to load pending business verifications");
  }

  const rowsRaw = Array.isArray(data) ? data : [];
  const ownerIds = rowsRaw
    .map((row: any) => String(row?.owner_user_id || "").trim())
    .filter(Boolean);

  const ownerEmailById = new Map<string, string | null>();
  if (ownerIds.length) {
    const { data: userRows } = await client
      .from("users")
      .select("id, email")
      .in("id", Array.from(new Set(ownerIds)));
    for (const row of Array.isArray(userRows) ? userRows : []) {
      ownerEmailById.set(String(row?.id || ""), row?.email ?? null);
    }
  }

  const rows: PendingBusinessVerificationRow[] = rowsRaw.map((row: any) => {
    const ownerUserId = String(row?.owner_user_id || "");
    return {
      owner_user_id: ownerUserId,
      public_id: row?.public_id ?? null,
      business_name: row?.business_name ?? null,
      category: row?.category ?? null,
      city: row?.city ?? null,
      created_at: row?.created_at ?? null,
      verification_status: normalizeStatus(row?.verification_status),
      stripe_connected: row?.stripe_connected === true,
      is_internal: row?.is_internal === true,
      risk_flags: asRecord(row?.risk_flags),
      owner_email: ownerEmailById.get(ownerUserId) ?? null,
    };
  });

  return {
    rows,
    total_count: Number(count || 0),
  };
}

export async function setBusinessVerificationStatus({
  owner_user_id,
  next_status,
}: SetBusinessVerificationStatusParams): Promise<PendingBusinessVerificationRow> {
  const admin = await requireAdminRole("admin_super");
  const { client } = await getAdminDataClient({ mode: "service" });
  const ownerUserId = String(owner_user_id || "").trim();
  if (!ownerUserId) {
    throw new Error("Missing owner_user_id");
  }

  const { data: current, error: currentError } = await client
    .from("businesses")
    .select(
      "owner_user_id, public_id, business_name, category, city, created_at, verification_status, stripe_connected, is_internal, risk_flags, verified_at"
    )
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();

  if (currentError) {
    throw new Error(currentError.message || "Failed to load current business verification state");
  }
  if (!current) {
    throw new Error("Business not found for owner_user_id");
  }

  const updatePayload =
    next_status === "manually_verified"
      ? { verification_status: "manually_verified", verified_at: new Date().toISOString() }
      : next_status === "suspended"
        ? { verification_status: "suspended", verified_at: null }
        : { verification_status: "pending", verified_at: null };

  const { data: updated, error: updateError } = await client
    .from("businesses")
    .update(updatePayload)
    .eq("owner_user_id", ownerUserId)
    .select(
      "owner_user_id, public_id, business_name, category, city, created_at, verification_status, stripe_connected, is_internal, risk_flags"
    )
    .maybeSingle();

  if (updateError) {
    throw new Error(updateError.message || "Failed to update business verification status");
  }
  if (!updated) {
    throw new Error("Verification status update did not return a row");
  }

  let ownerEmail: string | null = null;
  const { data: ownerUserRow } = await client
    .from("users")
    .select("email")
    .eq("id", ownerUserId)
    .maybeSingle();
  ownerEmail = ownerUserRow?.email ?? null;

  const prevStatus = normalizeStatus(current.verification_status);
  const newStatus = normalizeStatus(updated.verification_status);
  const auditPayload = {
    action:
      newStatus === "manually_verified"
        ? "business_verify"
        : newStatus === "suspended"
          ? "business_suspend"
          : "business_reset_pending",
    target_type: "business",
    target_id: ownerUserId,
    actor_user_id: admin.user.id,
    meta: {
      prev_status: prevStatus,
      new_status: newStatus,
      stripe_connected: updated.stripe_connected === true,
      is_internal: updated.is_internal === true,
    },
  };

  try {
    const auditResult = await logAdminAction(client, {
      action: auditPayload.action,
      actorUserId: auditPayload.actor_user_id,
      targetType: auditPayload.target_type,
      targetId: auditPayload.target_id,
      meta: auditPayload.meta,
    });
    if (!auditResult.ok) {
      console.warn("[admin][business-verification] audit-fallback", auditPayload);
    }
  } catch {
    console.warn("[admin][business-verification] audit-fallback", auditPayload);
  }

  return {
    owner_user_id: String(updated.owner_user_id || ownerUserId),
    public_id: updated.public_id ?? null,
    business_name: updated.business_name ?? null,
    category: updated.category ?? null,
    city: updated.city ?? null,
    created_at: updated.created_at ?? null,
    verification_status: newStatus,
    stripe_connected: updated.stripe_connected === true,
    is_internal: updated.is_internal === true,
    risk_flags: asRecord(updated.risk_flags),
    owner_email: ownerEmail,
  };
}
