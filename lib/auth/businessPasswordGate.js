import { normalizeAppRole } from "@/lib/auth/redirects";
import { isBusinessOnboardingComplete } from "@/lib/business/onboardingCompletion";

export const BUSINESS_CREATE_PASSWORD_PATH = "/business-auth/create-password";
export const BUSINESS_ONBOARDING_PATH = "/onboarding";
export const BUSINESS_DASHBOARD_PATH = "/business/dashboard";
export const BUSINESS_PASSWORD_MIN_LENGTH = 8;
export const BUSINESS_PROFILE_SELECT =
  "owner_user_id,business_name,category,address,city,state,postal_code";

export function isPasswordSet(value) {
  return value === true;
}

export function shouldRequireBusinessPasswordSetup({ role, passwordSet }) {
  return normalizeAppRole(role) === "business" && !isPasswordSet(passwordSet);
}

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

  const role =
    userRow?.is_internal === true
      ? "admin"
      : normalizeAppRole(userRow?.role) || normalizeAppRole(fallbackRole);

  const { data: businessRow } = await supabase
    .from("businesses")
    .select(BUSINESS_PROFILE_SELECT)
    .eq("owner_user_id", userId)
    .maybeSingle();

  return {
    userRow: userRow || null,
    businessRow: businessRow || null,
    role,
    passwordSet: isPasswordSet(userRow?.password_set),
    onboardingComplete: isBusinessOnboardingComplete(businessRow),
    accountStatus: userRow?.account_status || null,
  };
}
