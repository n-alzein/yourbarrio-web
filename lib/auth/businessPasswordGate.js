import { getRoleLandingPath, normalizeAppRole } from "@/lib/auth/redirects";
import { isBusinessOnboardingComplete } from "@/lib/business/onboardingCompletion";

export const BUSINESS_CREATE_PASSWORD_PATH = "/business-auth/create-password";
export const BUSINESS_POST_CONFIRM_PATH = "/business-auth/post-confirm";
export const BUSINESS_ONBOARDING_PATH = "/onboarding";
export const BUSINESS_DASHBOARD_PATH = "/business/dashboard";
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

  return safeNext || BUSINESS_DASHBOARD_PATH;
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
      destination: `/business-auth/login?next=${encodeURIComponent(BUSINESS_CREATE_PASSWORD_PATH)}`,
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
          : "/signin?modal=signin",
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
