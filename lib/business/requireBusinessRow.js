import "server-only";

import { redirect } from "next/navigation";
import { getSupabaseServerAuthedClient } from "@/lib/supabaseServer";

function normalizeRole(value) {
  if (typeof value !== "string") return null;
  const role = value.trim().toLowerCase();
  if (role === "business" || role === "customer" || role === "admin") return role;
  return null;
}

function createAccessError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export function getRoleFromAuthUser(user, fallbackRole = null) {
  const appRole = normalizeRole(user?.app_metadata?.role);
  if (appRole) return appRole;
  const userMetaRole = normalizeRole(user?.user_metadata?.role);
  if (userMetaRole) return userMetaRole;
  return normalizeRole(fallbackRole);
}

export async function resolveRoleFromUserAndClient(supabase, user) {
  const authRole = getRoleFromAuthUser(user);
  if (authRole) return authRole;
  if (!supabase || !user?.id) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return normalizeRole(profile?.role);
}

export async function findBusinessRowForOwner(supabase, ownerUserId) {
  if (!supabase || !ownerUserId) return null;
  const { data } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();
  return data?.id || null;
}

function logMissingBusinessRow() {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[gate] business user missing businesses row -> /onboarding");
  }
}

export async function getRequiredBusinessId({ supabase, userId, role }) {
  if (!userId) {
    throw createAccessError(401, "UNAUTHORIZED", "Unauthorized");
  }
  if (normalizeRole(role) !== "business") {
    throw createAccessError(403, "FORBIDDEN", "Forbidden");
  }

  const businessId = await findBusinessRowForOwner(supabase, userId);
  if (!businessId) {
    throw createAccessError(
      403,
      "BUSINESS_ROW_MISSING",
      "Business onboarding required"
    );
  }

  return businessId;
}

export async function requireBusinessRowOrOnboarding() {
  const supabase = await getSupabaseServerAuthedClient();
  if (!supabase) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return;

  const role = await resolveRoleFromUserAndClient(supabase, user);
  if (role !== "business") return;

  const businessId = await findBusinessRowForOwner(supabase, user.id);
  if (businessId) return;

  logMissingBusinessRow();
  redirect("/onboarding");
}

export function logBusinessRowMissingGate() {
  logMissingBusinessRow();
}
