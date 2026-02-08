import { PATHS } from "@/lib/auth/paths";

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

export function resolvePostLoginTarget({ profile, role, roles, next }) {
  const safeNext = getSafeRedirectPath(next);
  if (safeNext) return safeNext;

  if ((profile?.role || role) === "admin") {
    return "/admin";
  }

  if ((profile?.role || role) === "business") {
    return PATHS.business.dashboard;
  }

  return PATHS.customer.home;
}
