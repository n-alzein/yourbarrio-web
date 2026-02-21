import { PATHS } from "@/lib/auth/paths";

const ADMIN_ROLE_KEYS = new Set([
  "admin",
  "super_admin",
  "admin_readonly",
  "admin_support",
  "admin_ops",
  "admin_super",
]);

export function getSafeRedirectPath(next) {
  if (!next) return null;
  const trimmed = String(next).trim();
  if (!trimmed) return null;
  // Only allow same-origin absolute path redirects.
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  const lowered = trimmed.toLowerCase();
  if (lowered.includes("http:") || lowered.includes("https:")) return null;
  return trimmed;
}

export function normalizeAppRole(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith("admin_")) return "admin";
  if (ADMIN_ROLE_KEYS.has(normalized)) return "admin";
  if (normalized === "business") return "business";
  if (normalized === "customer") return "customer";
  return null;
}

export function getRoleLandingPath(role) {
  const normalizedRole = normalizeAppRole(role);
  if (normalizedRole === "admin") return "/admin";
  if (normalizedRole === "business") return PATHS.business.dashboard;
  return PATHS.customer.home;
}

export function getPostLoginRedirect({ role, requestedPath, fallbackPath } = {}) {
  const normalizedRole = normalizeAppRole(role);
  const requested = getSafeRedirectPath(requestedPath);
  const fallback = getSafeRedirectPath(fallbackPath);
  const defaultPath = getRoleLandingPath(normalizedRole);
  const isAdmin = normalizedRole === "admin";

  const choose = (candidate) => {
    if (!candidate) return null;
    if (!isAdmin && candidate.startsWith("/admin")) {
      return defaultPath;
    }
    return candidate;
  };

  return choose(requested) || choose(fallback) || defaultPath;
}

export function resolvePostLoginTarget({ profile, role, roles, next }) {
  const normalizedRole =
    normalizeAppRole(profile?.role) ||
    normalizeAppRole(role) ||
    (Array.isArray(roles) && roles.some((value) => normalizeAppRole(value) === "admin")
      ? "admin"
      : null) ||
    "customer";

  return getPostLoginRedirect({
    role: normalizedRole,
    requestedPath: next,
  });
}
