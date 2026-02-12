export const ADMIN_ROLE_KEYS = [
  "admin_readonly",
  "admin_support",
  "admin_ops",
  "admin_super",
] as const;

export type AdminRoleKey = (typeof ADMIN_ROLE_KEYS)[number];

export type AdminProfileLike = {
  role?: string | null;
  is_internal?: boolean | null;
} | null | undefined;

function isAdminLikeRole(role?: string | null): boolean {
  if (typeof role !== "string") return false;
  const normalized = role.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "admin" || normalized === "super_admin" || normalized === "admin_super") {
    return true;
  }
  return normalized.startsWith("admin_");
}

export function hasAdminRoleKey(roles?: Array<string | null | undefined>): boolean {
  if (!Array.isArray(roles) || !roles.length) return false;
  const valid = new Set<string>(ADMIN_ROLE_KEYS);
  return roles.some((role) => typeof role === "string" && valid.has(role));
}

export function isAdminProfile(
  profile?: AdminProfileLike,
  roles?: Array<string | null | undefined>
): boolean {
  if (isAdminLikeRole(profile?.role)) return true;
  if (profile?.is_internal === true) return true;
  if (hasAdminRoleKey(roles)) return true;
  return false;
}
