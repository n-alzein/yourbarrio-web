import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const DELETED_USER_BAN_DURATION = "876000h";

const isNotFoundAuthError = (error: any) => {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("not found") || message.includes("user not found");
};

export async function disableAuthAccessForDeletedUser({
  adminClient,
  userId,
}: {
  adminClient: SupabaseClient;
  userId: string;
}) {
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: DELETED_USER_BAN_DURATION,
  });

  if (error && !isNotFoundAuthError(error)) {
    return {
      ok: false as const,
      error: error.message || "Failed to disable auth access.",
    };
  }

  return { ok: true as const };
}

export async function restoreAuthAccessForUser({
  adminClient,
  userId,
}: {
  adminClient: SupabaseClient;
  userId: string;
}) {
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });

  if (error && !isNotFoundAuthError(error)) {
    return {
      ok: false as const,
      error: error.message || "Failed to restore auth access.",
    };
  }

  return { ok: true as const };
}
