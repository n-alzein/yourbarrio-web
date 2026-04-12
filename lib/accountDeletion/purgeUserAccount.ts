import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ACCOUNT_STATUS, normalizeAccountStatus } from "@/lib/accountDeletion/status";
import { disableAuthAccessForDeletedUser } from "@/lib/accountDeletion/authAccess";

export type PurgeOutcome = {
  ok: boolean;
  targetUserId: string;
  result: "purged" | "already_purged" | "not_pending";
  cleanupSummary: Record<string, number>;
  step?:
    | "load_user"
    | "cleanup_ephemeral_data"
    | "anonymize_business"
    | "anonymize_user"
    | "disable_auth";
  error?: string;
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
  const nowIso = new Date().toISOString();

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
      step: "load_user",
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

    const { error: businessUpdateError } = await adminClient
      .from("businesses")
      .update({
        account_status: ACCOUNT_STATUS.DELETED,
        deleted_at: nowIso,
        restored_at: null,
        deletion_requested_at: nowIso,
        scheduled_purge_at: null,
        verification_status: "suspended",
        business_name: "Deleted user",
        description: null,
        website: null,
        phone: null,
        profile_photo_url: null,
        cover_photo_url: null,
        address: null,
        address_2: null,
        city: null,
        state: null,
        postal_code: null,
        latitude: null,
        longitude: null,
        hours_json: null,
        social_links_json: null,
      })
      .eq("owner_user_id", userId);

    if (businessUpdateError) {
      return {
        ok: false,
        targetUserId: userId,
        result: "not_pending",
        cleanupSummary,
        step: "anonymize_business",
        error: businessUpdateError.message || "Failed to anonymize business row",
      };
    }

    const { error: userUpdateError } = await adminClient
      .from("users")
      .update({
        account_status: ACCOUNT_STATUS.DELETED,
        deletion_requested_at: nowIso,
        scheduled_purge_at: null,
        deleted_at: nowIso,
        anonymized_at: nowIso,
        restored_at: null,
        full_name: "Deleted user",
        business_name: "Deleted user",
        email: `deleted+${userId}@yourbarrio.invalid`,
        profile_photo_url: null,
        phone: null,
        category: null,
        business_type: null,
        description: null,
        website: null,
        address: null,
        address_2: null,
        city: null,
        state: null,
        postal_code: null,
      })
      .eq("id", userId);

    if (userUpdateError) {
      return {
        ok: false,
        targetUserId: userId,
        result: "not_pending",
        cleanupSummary,
        step: "anonymize_user",
        error: userUpdateError.message || "Failed to anonymize user row",
      };
    }

    const disableAuthResult = await disableAuthAccessForDeletedUser({
      adminClient,
      userId,
    });
    if (!disableAuthResult.ok) {
      return {
        ok: false,
        targetUserId: userId,
        result: "not_pending",
        cleanupSummary,
        step: "disable_auth",
        error: disableAuthResult.error,
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
      step: "cleanup_ephemeral_data",
      error: error?.message || "Unexpected purge error",
    };
  }
}
