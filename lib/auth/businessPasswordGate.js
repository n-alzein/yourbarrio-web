import { getRoleLandingPath, normalizeAppRole } from "@/lib/auth/redirects";
import { isBusinessOnboardingComplete } from "@/lib/business/onboardingCompletion";

export const BUSINESS_CREATE_PASSWORD_PATH = "/business-auth/create-password";
export const BUSINESS_POST_CONFIRM_PATH = "/business-auth/post-confirm";
export const BUSINESS_ONBOARDING_PATH = "/onboarding";
export const BUSINESS_DASHBOARD_PATH = "/business/dashboard";
export const BUSINESS_GO_DASHBOARD_PATH = "/go/dashboard";
export const BUSINESS_PASSWORD_MIN_LENGTH = 8;
export const BUSINESS_PROFILE_SELECT =
  "owner_user_id,business_name,category,address,city,state,postal_code";

export function getBusinessAuthCookieNames(cookies = []) {
  return cookies
    .map((cookie) => (typeof cookie?.name === "string" ? cookie.name : ""))
    .filter((name) => name.startsWith("sb-"));
}

export function isPasswordSet(value) {
  return value === true;
}

/**
 * @param {{
 *   role?: string | null;
 *   fallbackRole?: string | null;
 *   passwordSet?: boolean | null;
 *   businessRow?: { owner_user_id?: string | null } | null;
 * }} params
 */
export function isBusinessPasswordSetupCandidate({
  role,
  fallbackRole = null,
  passwordSet,
  businessRow = null,
} = {}) {
  const normalizedRole = normalizeAppRole(role) || normalizeAppRole(fallbackRole);
  if (normalizedRole === "business") {
    return !isPasswordSet(passwordSet);
  }
  return Boolean(businessRow?.owner_user_id) && !isPasswordSet(passwordSet);
}

export function shouldRequireBusinessPasswordSetup({ role, passwordSet }) {
  return normalizeAppRole(role) === "business" && !isPasswordSet(passwordSet);
}

function normalizeBusinessNextPath(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;

  if (trimmed === "/business/onboarding" || trimmed.startsWith("/business/onboarding/")) {
    return trimmed.replace(/^\/business\/onboarding/, BUSINESS_ONBOARDING_PATH);
  }

  if (
    trimmed.startsWith("/business-auth/") ||
    trimmed.startsWith("/auth/") ||
    trimmed.startsWith("/login") ||
    trimmed.startsWith("/signin") ||
    trimmed.startsWith("/business/login") ||
    trimmed.startsWith("/business/register") ||
    trimmed.startsWith("/business/signup")
  ) {
    return null;
  }

  if (trimmed === "/business" || trimmed === "/business/") {
    return BUSINESS_GO_DASHBOARD_PATH;
  }

  if (
    trimmed === BUSINESS_GO_DASHBOARD_PATH ||
    trimmed === "/go/account" ||
    trimmed === BUSINESS_ONBOARDING_PATH ||
    trimmed.startsWith(`${BUSINESS_ONBOARDING_PATH}/`) ||
    trimmed === BUSINESS_DASHBOARD_PATH ||
    trimmed.startsWith(`${BUSINESS_DASHBOARD_PATH}/`) ||
    trimmed.startsWith("/business/settings") ||
    trimmed.startsWith("/business/messages") ||
    trimmed.startsWith("/business/orders") ||
    trimmed.startsWith("/business/profile") ||
    trimmed.startsWith("/business/listings") ||
    trimmed.startsWith("/business/profile")
  ) {
    return trimmed;
  }

  return null;
}

export function isBusinessIntentPath(path) {
  return Boolean(normalizeBusinessNextPath(path));
}

/**
 * @param {{
 *   role?: string | null;
 *   hasSession?: boolean | null;
 *   hasUser?: boolean | null;
 *   userRow?: { password_set?: boolean | null } | null;
 *   businessRow?: { owner_user_id?: string | null } | null;
 *   passwordSet?: boolean | null;
 *   onboardingComplete?: boolean | null;
 *   safeNext?: string | null;
 * }} params
 */
export function resolvePostAuthDestination({
  role,
  hasSession,
  hasUser,
  userRow = null,
  businessRow = null,
  passwordSet,
  onboardingComplete,
  safeNext = null,
} = {}) {
  const normalizedRole = normalizeAppRole(role);
  const normalizedNext = normalizeBusinessNextPath(safeNext);
  const resolvedPasswordSet =
    typeof passwordSet === "boolean" ? passwordSet : isPasswordSet(userRow?.password_set);
  const resolvedOnboardingComplete =
    typeof onboardingComplete === "boolean"
      ? onboardingComplete
      : isBusinessOnboardingComplete(businessRow);

  if (!hasSession || !hasUser) {
    return normalizedRole === "business"
      ? `/business/login?next=${encodeURIComponent(BUSINESS_GO_DASHBOARD_PATH)}`
      : getRoleLandingPath(normalizedRole);
  }

  if (normalizedRole !== "business") {
    return getRoleLandingPath(normalizedRole);
  }

  return getBusinessRedirectDestination({
    passwordSet: resolvedPasswordSet,
    onboardingComplete: resolvedOnboardingComplete,
    safeNext: normalizedNext,
  });
}

/**
 * @param {{
 *   passwordSet?: boolean | null;
 *   onboardingComplete?: boolean | null;
 *   safeNext?: string | null;
 * }} params
 */
export function getBusinessRedirectDestination({
  passwordSet,
  onboardingComplete,
  safeNext = null,
} = {}) {
  if (!isPasswordSet(passwordSet)) {
    return BUSINESS_CREATE_PASSWORD_PATH;
  }

  if (!onboardingComplete) {
    return BUSINESS_ONBOARDING_PATH;
  }

  return normalizeBusinessNextPath(safeNext) || BUSINESS_DASHBOARD_PATH;
}

export function getBusinessCreatePasswordAccessDecision({
  hasSession,
  role,
  fallbackRole = null,
  passwordSet,
  onboardingComplete,
  businessRow = null,
} = {}) {
  const normalizedRole = normalizeAppRole(role) || normalizeAppRole(fallbackRole);
  const allowBusinessPasswordSetup = isBusinessPasswordSetupCandidate({
    role: normalizedRole,
    fallbackRole,
    passwordSet,
    businessRow,
  });

  if (!hasSession) {
    return {
      action: "redirect",
      destination: `/business/login?next=${encodeURIComponent(BUSINESS_CREATE_PASSWORD_PATH)}`,
      reason: "no_session",
    };
  }

  if (allowBusinessPasswordSetup) {
    return {
      action: "render",
      destination: null,
      reason: "business_password_setup_required",
    };
  }

  if (normalizedRole !== "business") {
    return {
      action: "redirect",
      destination:
        normalizedRole === "admin" || normalizedRole === "customer"
          ? getRoleLandingPath(normalizedRole)
          : "/login",
      reason: normalizedRole ? `wrong_role_${normalizedRole}` : "role_unresolved",
    };
  }

  return {
    action: "redirect",
    destination: getBusinessRedirectDestination({
      passwordSet,
      onboardingComplete,
    }),
    reason: !onboardingComplete
      ? "password_already_set_onboarding_required"
      : "password_already_set_dashboard_ready",
  };
}

export function logBusinessRedirectTrace(scope, payload = {}) {
  console.warn(`[BUSINESS_REDIRECT_TRACE] ${scope}`, payload);
}

/**
 * @param {{
 *   supabase?: import("@supabase/supabase-js").SupabaseClient | null;
 *   userId?: string | null;
 *   fallbackRole?: string | null;
 * }} params
 */
export async function getBusinessPasswordGateState({
  supabase,
  userId,
  fallbackRole = null,
} = {}) {
  if (!supabase || !userId) {
    return {
      userRow: null,
      businessRow: null,
      role: normalizeAppRole(fallbackRole),
      passwordSet: false,
      onboardingComplete: false,
      accountStatus: null,
    };
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("role,is_internal,password_set,account_status")
    .eq("id", userId)
    .maybeSingle();

  const { data: businessRow } = await supabase
    .from("businesses")
    .select(BUSINESS_PROFILE_SELECT)
    .eq("owner_user_id", userId)
    .maybeSingle();

  const role =
    userRow?.is_internal === true
      ? "admin"
      : normalizeAppRole(userRow?.role) ||
        normalizeAppRole(fallbackRole) ||
        (businessRow?.owner_user_id ? "business" : null);

  return {
    userRow: userRow || null,
    businessRow: businessRow || null,
    role,
    passwordSet: isPasswordSet(userRow?.password_set),
    onboardingComplete: isBusinessOnboardingComplete(businessRow),
    accountStatus: userRow?.account_status || null,
  };
}
