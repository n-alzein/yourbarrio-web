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

/**
 * Ensure an authenticated auth user also has a baseline row in public.users.
 *
 * @param {{
 *   userId?: string;
 *   email?: string;
 *   fallbackRole?: string | null;
 *   debug?: boolean;
 *   source?: string;
 * }} params
 */
export async function ensureUserProvisionedForUser({
  userId,
  email = "",
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

  const normalizedEmail = String(email || "").trim().toLowerCase();
  const { data: existingUser, error: existingUserError } = await serviceClient
    .from("users")
    .select("id,role,is_internal,password_set")
    .eq("id", trimmedUserId)
    .maybeSingle();
  if (existingUserError) {
    throw new Error(existingUserError.message || "Failed to read user row");
  }

  const resolvedRole =
    normalizeStoredRole(existingUser?.role) || normalizeStoredRole(fallbackRole) || "customer";
  const userPayload = {
    id: trimmedUserId,
    role: resolvedRole,
    is_internal: existingUser?.is_internal === true,
    password_set: existingUser?.password_set === true,
    updated_at: new Date().toISOString(),
  };

  if (normalizedEmail) {
    userPayload.email = normalizedEmail;
  }

  if (!existingUser?.id) {
    userPayload.full_name = "";
  }

  const { error: upsertUserError } = await serviceClient
    .from("users")
    .upsert(userPayload, { onConflict: "id", ignoreDuplicates: false });
  if (upsertUserError) {
    throw new Error(upsertUserError.message || "Failed to provision user row");
  }

  const result = {
    userCreated: !existingUser?.id,
    role: resolvedRole,
  };

  if (debug || process.env.NODE_ENV !== "production") {
    console.warn("[AUTH_REDIRECT_TRACE] user_provisioning", {
      source,
      userId: trimmedUserId,
      userCreated: result.userCreated,
      role: result.role,
    });
  }

  return result;
}
