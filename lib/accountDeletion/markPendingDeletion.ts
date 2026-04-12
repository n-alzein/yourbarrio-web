import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ACCOUNT_STATUS, normalizeAccountStatus } from "@/lib/accountDeletion/status";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type MarkPendingDeletionSuccess = {
  ok: true;
  result: "scheduled" | "already_pending";
  role: string | null;
  accountStatus: typeof ACCOUNT_STATUS.PENDING_DELETION;
  deletionRequestedAt: string;
  scheduledPurgeAt: string;
};

export type MarkPendingDeletionFailure = {
  ok: false;
  status: number;
  error: string;
  step:
    | "load_user"
    | "validate_status"
    | "mark_user_pending"
    | "mark_business_pending";
};

export type MarkPendingDeletionResult =
  | MarkPendingDeletionSuccess
  | MarkPendingDeletionFailure;

export function isMarkPendingDeletionFailure(
  value: MarkPendingDeletionResult
): value is MarkPendingDeletionFailure {
  return value.ok === false;
}

function buildPurgeAtIso(nowMs: number) {
  return new Date(nowMs + THIRTY_DAYS_MS).toISOString();
}

export async function markUserPendingDeletion({
  client,
  userId,
  deletedByAdminUserId = null,
  reason = "user_initiated",
}: {
  client: SupabaseClient;
  userId: string;
  deletedByAdminUserId?: string | null;
  reason?: string | null;
}): Promise<MarkPendingDeletionResult> {
  const { data: userRow, error: userError } = await client
    .from("users")
    .select("id, role, account_status, scheduled_purge_at, deletion_requested_at")
    .eq("id", userId)
    .maybeSingle();

  if (userError || !userRow?.id) {
    return {
      ok: false,
      status: 404,
      error: userError?.message || "Account profile not found.",
      step: "load_user",
    };
  }

  const existingStatus = normalizeAccountStatus(userRow.account_status);
  if (existingStatus === ACCOUNT_STATUS.DELETED) {
    return {
      ok: false,
      status: 409,
      error: "This account is already finalized.",
      step: "validate_status",
    };
  }

  if (existingStatus === ACCOUNT_STATUS.PENDING_DELETION) {
    return {
      ok: true,
      result: "already_pending",
      role: String(userRow.role || "").trim().toLowerCase() || null,
      accountStatus: ACCOUNT_STATUS.PENDING_DELETION,
      deletionRequestedAt:
        userRow.deletion_requested_at || new Date().toISOString(),
      scheduledPurgeAt:
        userRow.scheduled_purge_at || new Date(Date.now() + THIRTY_DAYS_MS).toISOString(),
    };
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const scheduledPurgeAt = buildPurgeAtIso(nowMs);
  const role = String(userRow.role || "").trim().toLowerCase() || null;

  const { error: markUserError } = await client
    .from("users")
    .update({
      account_status: ACCOUNT_STATUS.PENDING_DELETION,
      deletion_requested_at: nowIso,
      scheduled_purge_at: scheduledPurgeAt,
      deleted_at: null,
      anonymized_at: null,
      restored_at: null,
      restored_by_admin_user_id: null,
      deleted_by_admin_user_id: deletedByAdminUserId,
      deletion_reason: reason || "user_initiated",
    })
    .eq("id", userId);

  if (markUserError) {
    return {
      ok: false,
      status: 500,
      error: markUserError.message || "Failed to schedule account deletion.",
      step: "mark_user_pending",
    };
  }

  if (role === "business") {
    const { error: markBusinessError } = await client
      .from("businesses")
      .update({
        account_status: ACCOUNT_STATUS.PENDING_DELETION,
        deletion_requested_at: nowIso,
        scheduled_purge_at: scheduledPurgeAt,
        deleted_at: null,
        restored_at: null,
        verification_status: "suspended",
      })
      .eq("owner_user_id", userId);

    if (markBusinessError) {
      return {
        ok: false,
        status: 500,
        error: markBusinessError.message || "Failed to suspend business access.",
        step: "mark_business_pending",
      };
    }
  }

  return {
    ok: true,
    result: "scheduled",
    role,
    accountStatus: ACCOUNT_STATUS.PENDING_DELETION,
    deletionRequestedAt: nowIso,
    scheduledPurgeAt,
  };
}
