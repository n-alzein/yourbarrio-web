import "server-only";

import { normalizeAppRole } from "@/lib/auth/redirects";
import { getSupabaseServerClient as getServiceRoleClient } from "@/lib/supabase/server";

function normalizeStoredRole(value) {
  if (value == null || String(value).trim() === "") return null;
  const normalized = normalizeAppRole(value);
  if (normalized === "admin") return "admin";
  if (normalized === "business") return "business";
  return "customer";
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function isDeletedPlaceholderEmail(value) {
  const email = normalizeEmail(value);
  return /^deleted\+.+@(deleted\.local|yourbarrio\.invalid)$/.test(email);
}

function isDeletedPlaceholderName(value) {
  return normalizeText(value).toLowerCase() === "deleted user";
}

export function isTombstonedUserRow(row) {
  if (!row?.id) return false;
  return (
    isDeletedPlaceholderEmail(row.email) ||
    isDeletedPlaceholderName(row.full_name) ||
    isDeletedPlaceholderName(row.business_name) ||
    normalizeText(row.account_status).toLowerCase() === "deleted" ||
    Boolean(row.deleted_at) ||
    Boolean(row.anonymized_at)
  );
}

/**
 * Ensure an authenticated auth user also has a baseline row in public.users.
 * Tombstoned placeholder rows are repaired from the active auth identity.
 *
 * @param {{
 *   userId?: string;
 *   email?: string;
 *   fullName?: string;
 *   avatarUrl?: string;
 *   fallbackRole?: string | null;
 *   debug?: boolean;
 *   source?: string;
 * }} params
 */
export async function ensureUserProvisionedForUser({
  userId,
  email = "",
  fullName = "",
  avatarUrl = "",
  fallbackRole = null,
  debug = false,
  source = "unknown",
} = {}) {
  const trimmedUserId = String(userId || "").trim();
  if (!trimmedUserId) {
    throw new Error("Missing user id for user provisioning");
  }

  const serviceClient = getServiceRoleClient();
  if (!serviceClient) {
    throw new Error("Missing service role Supabase client");
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedFullName = normalizeText(fullName);
  const normalizedAvatarUrl = normalizeText(avatarUrl);
  const { data: existingUser, error: existingUserError } = await serviceClient
    .from("users")
    .select(
      "id,email,role,full_name,business_name,profile_photo_url,account_status,deleted_at,anonymized_at,is_internal,password_set"
    )
    .eq("id", trimmedUserId)
    .maybeSingle();
  if (existingUserError) {
    throw new Error(existingUserError.message || "Failed to read user row");
  }

  const userCreated = !existingUser?.id;
  const userRepaired = !userCreated && isTombstonedUserRow(existingUser);
  const shouldUseAuthIdentity = userCreated || userRepaired;
  const resolvedRole =
    normalizeStoredRole(existingUser?.role) || normalizeStoredRole(fallbackRole) || "customer";
  const userPayload = {
    id: trimmedUserId,
    role: resolvedRole,
    is_internal: existingUser?.is_internal === true,
    password_set: existingUser?.password_set === true,
    updated_at: new Date().toISOString(),
  };

  const existingEmail = normalizeEmail(existingUser?.email);
  const existingFullName = normalizeText(existingUser?.full_name);
  const existingAvatarUrl = normalizeText(existingUser?.profile_photo_url);

  const resolvedEmail = shouldUseAuthIdentity
    ? normalizedEmail || existingEmail
    : existingEmail || normalizedEmail;
  const resolvedFullName = shouldUseAuthIdentity
    ? normalizedFullName
    : existingFullName || normalizedFullName;
  const resolvedAvatarUrl = shouldUseAuthIdentity
    ? normalizedAvatarUrl
    : existingAvatarUrl || normalizedAvatarUrl;

  if (resolvedEmail) {
    userPayload.email = resolvedEmail;
  }

  if (shouldUseAuthIdentity || resolvedFullName) {
    userPayload.full_name = resolvedFullName || "";
  }

  if (shouldUseAuthIdentity || resolvedAvatarUrl) {
    userPayload.profile_photo_url = resolvedAvatarUrl || null;
  }

  if (userRepaired) {
    userPayload.account_status = "active";
    userPayload.deleted_at = null;
    userPayload.anonymized_at = null;
    if (isDeletedPlaceholderName(existingUser?.business_name)) {
      userPayload.business_name = null;
    }
  }

  const { error: upsertUserError } = await serviceClient
    .from("users")
    .upsert(userPayload, { onConflict: "id", ignoreDuplicates: false });
  if (upsertUserError) {
    throw new Error(upsertUserError.message || "Failed to provision user row");
  }

  const result = {
    userCreated,
    userRepaired,
    role: resolvedRole,
  };

  if (debug || process.env.NODE_ENV !== "production") {
    console.warn("[AUTH_REDIRECT_TRACE] user_provisioning", {
      source,
      userId: trimmedUserId,
      userCreated: result.userCreated,
      userRepaired: result.userRepaired,
      role: result.role,
    });
  }

  return result;
}
