import "server-only";

import { redirect } from "next/navigation";
import { isAdminProfile } from "@/lib/auth/isAdmin";
import { getProfileCached, getSupabaseServerClient, getUserCached } from "@/lib/supabaseServer";

export const ADMIN_ROLES = [
  "admin_readonly",
  "admin_support",
  "admin_ops",
  "admin_super",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];
export type AdminCapability =
  | "view_dashboard"
  | "view_lists"
  | "view_audit"
  | "impersonate"
  | "add_internal_note"
  | "update_app_role"
  | "toggle_internal_user"
  | "moderation"
  | "manage_admins";

type AdminContext = {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  user: { id: string; email?: string | null };
  profile: Record<string, any> | null;
  roles: AdminRole[];
  devAllowlistUsed: boolean;
  strictPermissionBypassUsed: boolean;
};

type RequireAdminOptions = {
  unauthenticatedRedirectTo?: string;
  unauthorizedRedirectTo?: string;
};

const ROLE_ORDER: Record<AdminRole, number> = {
  admin_readonly: 10,
  admin_support: 20,
  admin_ops: 30,
  admin_super: 40,
};

const CAPABILITY_ROLES: Record<AdminCapability, AdminRole[]> = {
  view_dashboard: ["admin_readonly", "admin_support", "admin_ops", "admin_super"],
  view_lists: ["admin_readonly", "admin_support", "admin_ops", "admin_super"],
  view_audit: ["admin_readonly", "admin_support", "admin_ops", "admin_super"],
  impersonate: ["admin_support", "admin_super"],
  add_internal_note: ["admin_support", "admin_super"],
  update_app_role: ["admin_support", "admin_super"],
  toggle_internal_user: ["admin_ops", "admin_super"],
  moderation: ["admin_ops", "admin_super"],
  manage_admins: ["admin_super"],
};

function parseDevAllowEmails() {
  if (process.env.NODE_ENV === "production") return [];
  const value = process.env.ADMIN_DEV_ALLOW_EMAILS || "";
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function canBypassStrictPermissionsInDev() {
  return (
    process.env.NODE_ENV !== "production" &&
    String(process.env.ADMIN_DEV_BYPASS_PERMISSIONS || "").toLowerCase() === "true"
  );
}

function hasRoleOrHigher(roles: AdminRole[], requiredRole: AdminRole) {
  const needed = ROLE_ORDER[requiredRole];
  return roles.some((role) => ROLE_ORDER[role] >= needed);
}

export function getHighestAdminRole(roles: AdminRole[]): AdminRole | null {
  if (!roles.length) return null;
  return [...roles].sort((a, b) => ROLE_ORDER[b] - ROLE_ORDER[a])[0] || null;
}

export function hasExactAdminRole(roles: AdminRole[], requiredRole: AdminRole) {
  return roles.includes(requiredRole);
}

export function hasAnyAdminRole(roles: AdminRole[], allowedRoles: AdminRole[]) {
  if (!allowedRoles.length) return false;
  return roles.some((role) => allowedRoles.includes(role));
}

export function canAdmin(roles: AdminRole[], capability: AdminCapability) {
  return hasAnyAdminRole(roles, CAPABILITY_ROLES[capability] || []);
}

async function checkIsAdminViaRpc(supabase: any) {
  try {
    const { data, error } = await supabase.rpc("is_admin");
    if (error) return null;
    if (typeof data === "boolean") return data;
    return Boolean(data);
  } catch {
    return null;
  }
}

async function getRolesFromTable(supabase: any, userId: string): Promise<AdminRole[]> {
  const { data, error } = await supabase
    .from("admin_role_members")
    .select("role_key")
    .eq("user_id", userId);

  if (error || !Array.isArray(data)) return [];

  return data
    .map((row) => row?.role_key)
    .filter((role: unknown): role is AdminRole =>
      typeof role === "string" && (ADMIN_ROLES as readonly string[]).includes(role)
    );
}

export async function getAdminRolesForUser(userId?: string): Promise<AdminRole[]> {
  if (!userId) return [];
  const supabase = await getSupabaseServerClient();
  if (!supabase) return [];

  const roles = await getRolesFromTable(supabase, userId);

  // Backward-compatible fallback until all admins move to admin_role_members.
  if (!roles.length) {
    const profile = await getProfileCached(userId, supabase);
    if (isAdminProfile(profile, [])) {
      return ["admin_readonly" as AdminRole];
    }
  }

  return roles;
}

export async function getAdminRole(userId?: string): Promise<AdminRole | null> {
  const roles = await getAdminRolesForUser(userId);
  return getHighestAdminRole(roles);
}

export function isAdminDevAllowlistConfigured() {
  return parseDevAllowEmails().length > 0;
}

export async function requireAdmin(options: RequireAdminOptions = {}): Promise<AdminContext> {
  const { unauthenticatedRedirectTo = "/", unauthorizedRedirectTo = "/" } = options;
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect(unauthenticatedRedirectTo);

  const { user } = await getUserCached(supabase);
  if (!user) redirect(unauthenticatedRedirectTo);

  const email = String(user.email || "").toLowerCase();
  const devAllowlistUsed = parseDevAllowEmails().includes(email);

  const rpcIsAdmin = await checkIsAdminViaRpc(supabase);
  const roles = await getAdminRolesForUser(user.id);
  const profile = await getProfileCached(user.id, supabase);
  const fallbackIsAdmin = isAdminProfile(profile, roles);

  const isAdmin = Boolean(devAllowlistUsed || rpcIsAdmin === true || fallbackIsAdmin);
  const resolvedRoles: AdminRole[] = [...roles];
  if (devAllowlistUsed && !resolvedRoles.includes("admin_readonly")) {
    resolvedRoles.push("admin_readonly");
  }

  if (!isAdmin) redirect(unauthorizedRedirectTo);

  return {
    supabase,
    user: { id: user.id, email: user.email },
    profile,
    roles: resolvedRoles,
    devAllowlistUsed,
    strictPermissionBypassUsed: false,
  };
}

export async function requireAdminRole(requiredRole: AdminRole) {
  const context = await requireAdmin();

  if (context.devAllowlistUsed && canBypassStrictPermissionsInDev()) {
    return {
      ...context,
      strictPermissionBypassUsed: true,
    };
  }

  if (!hasRoleOrHigher(context.roles, requiredRole)) {
    redirect("/admin?error=forbidden");
  }

  return context;
}

export async function requireAdminAnyRole(requiredRoles: AdminRole[]) {
  const context = await requireAdmin();

  if (context.devAllowlistUsed && canBypassStrictPermissionsInDev()) {
    return {
      ...context,
      strictPermissionBypassUsed: true,
    };
  }

  if (!hasAnyAdminRole(context.roles, requiredRoles)) {
    redirect("/admin?error=forbidden");
  }

  return context;
}
