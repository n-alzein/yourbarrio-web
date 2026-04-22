import type { SupabaseClient, User } from "@supabase/supabase-js";

export type CurrentUserRole = "admin" | "business" | "customer" | "anon" | "unknown";

type RoleResolutionResult = {
  user: User | null;
  role: CurrentUserRole;
};

const ADMIN_ROLE_KEYS = new Set([
  "admin_readonly",
  "admin_support",
  "admin_ops",
  "admin_super",
]);

function normalizeRole(value: unknown): CurrentUserRole | null {
  if (typeof value !== "string") return null;
  const role = value.trim().toLowerCase();
  if (
    role === "admin" ||
    role === "super_admin" ||
    role === "admin_super" ||
    role.startsWith("admin_")
  ) {
    return "admin";
  }
  if (role === "business") return "business";
  if (role === "customer") return "customer";
  return null;
}

export async function resolveCurrentUserRoleFromClient(
  supabase: SupabaseClient,
  { log = false }: { log?: boolean } = {}
): Promise<RoleResolutionResult> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { user: null, role: "anon" };
    }

    const appRole = normalizeRole(user.app_metadata?.role);
    if (appRole) {
      if (log) console.warn("[AUTH_ROLE] resolved", { userId: user.id, role: appRole, source: "app_metadata" });
      return { user, role: appRole };
    }

    let profile = null;
    let profileError: unknown = null;
    try {
      const result = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      profile = result.data;
      profileError = result.error;
    } catch (error) {
      profileError = error;
    }
    if (!profileError) {
      const profileRole = normalizeRole(profile?.role);
      if (profileRole) {
        if (log) console.warn("[AUTH_ROLE] resolved", { userId: user.id, role: profileRole, source: "users.role" });
        return { user, role: profileRole };
      }
    } else if (log) {
      console.warn("[AUTH_ROLE] profile_lookup_failed", {
        userId: user.id,
        message: profileError instanceof Error ? profileError.message : String(profileError),
      });
    }

    let adminRows = null;
    let adminError: unknown = null;
    try {
      const result = await supabase
        .from("admin_role_members")
        .select("role_key")
        .eq("user_id", user.id);
      adminRows = result.data;
      adminError = result.error;
    } catch (error) {
      adminError = error;
    }

    if (!adminError && Array.isArray(adminRows)) {
      const hasAdminRole = adminRows.some((row) => ADMIN_ROLE_KEYS.has(String(row?.role_key || "")));
      if (hasAdminRole) {
        if (log) console.warn("[AUTH_ROLE] resolved", { userId: user.id, role: "admin", source: "admin_role_members" });
        return { user, role: "admin" };
      }
    } else if (log) {
      console.warn("[AUTH_ROLE] admin_lookup_failed", {
        userId: user.id,
        message: adminError instanceof Error ? adminError.message : String(adminError),
      });
    }

    // A valid Supabase auth user without an app profile yet is still an
    // authenticated customer. Provisioning/profile recovery must not make the
    // first post-OAuth customer request look logged out or forbidden.
    if (log) console.warn("[AUTH_ROLE] resolved", { userId: user.id, role: "customer", source: "authenticated_default_customer" });
    return { user, role: "customer" };
  } catch (error) {
    if (log) {
      console.warn("[AUTH_ROLE] resolve_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return { user: null, role: "unknown" };
  }
}
