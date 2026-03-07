import "server-only";

import { getSupabaseServerClient as getServiceRoleClient } from "@/lib/supabase/server";

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (role === "admin") return "admin";
  if (role === "customer") return "customer";
  if (role === "business") return "business";
  return null;
}

/**
 * @param {{ userId?: string; email?: string; debug?: boolean; source?: string }} params
 */
export async function ensureBusinessProvisionedForUser({
  userId,
  email = "",
  debug = false,
  source = "unknown",
} = {}) {
  const trimmedUserId = String(userId || "").trim();
  if (!trimmedUserId) {
    throw new Error("Missing user id for business provisioning");
  }

  const serviceClient = getServiceRoleClient();
  if (!serviceClient) {
    throw new Error("Missing service role Supabase client");
  }

  const normalizedEmail = String(email || "").trim().toLowerCase();
  const { data: existingUser, error: existingUserError } = await serviceClient
    .from("users")
    .select("id,role,public_id")
    .eq("id", trimmedUserId)
    .maybeSingle();
  if (existingUserError) {
    throw new Error(existingUserError.message || "Failed to read user row");
  }

  const existingRole = normalizeRole(existingUser?.role);
  const userPayload = {
    id: trimmedUserId,
    role: existingRole === "admin" ? "admin" : "business",
    full_name: normalizedEmail || "Business User",
    is_internal: false,
    updated_at: new Date().toISOString(),
  };
  if (normalizedEmail) {
    userPayload.email = normalizedEmail;
  }

  const { error: upsertUserError } = await serviceClient
    .from("users")
    .upsert(userPayload, { onConflict: "id", ignoreDuplicates: false });
  if (upsertUserError) {
    throw new Error(upsertUserError.message || "Failed to provision business user row");
  }

  const { data: userRow, error: userReadError } = await serviceClient
    .from("users")
    .select("public_id")
    .eq("id", trimmedUserId)
    .maybeSingle();
  if (userReadError) {
    throw new Error(userReadError.message || "Failed to read provisioned user row");
  }

  const { data: existingBusiness, error: existingBusinessError } = await serviceClient
    .from("businesses")
    .select("owner_user_id")
    .eq("owner_user_id", trimmedUserId)
    .maybeSingle();
  if (existingBusinessError) {
    throw new Error(existingBusinessError.message || "Failed to read business row");
  }

  const businessPayload = {
    owner_user_id: trimmedUserId,
    verification_status: "pending",
    is_internal: false,
  };
  if (userRow?.public_id) {
    businessPayload.public_id = userRow.public_id;
  }

  const { error: upsertBusinessError } = await serviceClient
    .from("businesses")
    .upsert(businessPayload, {
      onConflict: "owner_user_id",
      ignoreDuplicates: true,
    });

  if (upsertBusinessError) {
    throw new Error(upsertBusinessError.message || "Failed to provision business profile row");
  }

  const result = {
    userCreated: !existingUser?.id,
    businessCreated: !existingBusiness?.owner_user_id,
    hasPublicId: Boolean(userRow?.public_id),
  };

  if (debug || process.env.NODE_ENV !== "production") {
    console.warn("[AUTH_REDIRECT_TRACE] business_provisioning", {
      source,
      userId: trimmedUserId,
      userCreated: result.userCreated,
      businessCreated: result.businessCreated,
      hasPublicId: result.hasPublicId,
    });
  }

  return result;
}
