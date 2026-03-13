import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ACCOUNT_STATUS, normalizeAccountStatus } from "@/lib/accountDeletion/status";

export type PurgeOutcome = {
  ok: boolean;
  targetUserId: string;
  result: "purged" | "already_purged" | "not_pending";
  cleanupSummary: Record<string, number>;
  error?: string;
};

const notFoundAuthError = (error: any) => {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("not found") || message.includes("user not found");
};

async function deleteWithCount(
  adminClient: SupabaseClient,
  table: string,
  match: Record<string, any>
) {
  let query: any = adminClient.from(table).delete().select("id");
  for (const [key, value] of Object.entries(match)) {
    query = query.eq(key, value);
  }
  const { error, data } = await query;
  if (error) throw new Error(`${table}: ${error.message || "delete failed"}`);
  return Array.isArray(data) ? data.length : 0;
}

export async function purgeUserAccount({
  adminClient,
  userId,
}: {
  adminClient: SupabaseClient;
  userId: string;
}): Promise<PurgeOutcome> {
  const cleanupSummary: Record<string, number> = {};

  const { data: userRow, error: userError } = await adminClient
    .from("users")
    .select("id, role, account_status")
    .eq("id", userId)
    .maybeSingle();

  if (userError) {
    return {
      ok: false,
      targetUserId: userId,
      result: "not_pending",
      cleanupSummary,
      error: userError.message || "Failed to load user row",
    };
  }

  if (!userRow?.id) {
    return {
      ok: true,
      targetUserId: userId,
      result: "already_purged",
      cleanupSummary,
    };
  }

  const status = normalizeAccountStatus(userRow.account_status);
  if (status !== ACCOUNT_STATUS.PENDING_DELETION) {
    return {
      ok: true,
      targetUserId: userId,
      result: "not_pending",
      cleanupSummary,
    };
  }

  try {
    cleanupSummary.saved_listings = await deleteWithCount(adminClient, "saved_listings", {
      user_id: userId,
    });
    cleanupSummary.carts = await deleteWithCount(adminClient, "carts", { user_id: userId });
    cleanupSummary.vendor_members = await deleteWithCount(adminClient, "vendor_members", {
      user_id: userId,
    });
    cleanupSummary.notifications = await deleteWithCount(adminClient, "notifications", {
      recipient_user_id: userId,
    });

    await adminClient
      .from("orders")
      .update({
        contact_name: "Deleted User",
        contact_phone: null,
        contact_email: null,
        delivery_address1: null,
        delivery_address2: null,
        delivery_city: null,
        delivery_state: null,
        delivery_postal_code: null,
        delivery_instructions: null,
      })
      .eq("user_id", userId);

    await adminClient
      .from("businesses")
      .update({
        account_status: ACCOUNT_STATUS.DELETED,
        deleted_at: new Date().toISOString(),
        restored_at: null,
        deletion_requested_at: null,
        scheduled_purge_at: null,
        verification_status: "suspended",
      })
      .eq("owner_user_id", userId);

    await adminClient
      .from("users")
      .update({
        account_status: ACCOUNT_STATUS.DELETED,
        deleted_at: new Date().toISOString(),
      })
      .eq("id", userId);

    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId, false);
    if (authDeleteError && !notFoundAuthError(authDeleteError)) {
      return {
        ok: false,
        targetUserId: userId,
        result: "not_pending",
        cleanupSummary,
        error: authDeleteError.message || "Supabase Auth delete failed",
      };
    }

    return {
      ok: true,
      targetUserId: userId,
      result: "purged",
      cleanupSummary,
    };
  } catch (error: any) {
    return {
      ok: false,
      targetUserId: userId,
      result: "not_pending",
      cleanupSummary,
      error: error?.message || "Unexpected purge error",
    };
  }
}
