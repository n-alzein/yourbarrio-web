export const PATHS = {
  public: {
    root: "/",
    businessLanding: "/business",
  },
  auth: {
    customerLogin: "/login",
    businessLogin: "/business/login",
    businessPostConfirm: "/business-auth/post-confirm",
    businessCreatePassword: "/business-auth/create-password",
  },
  customer: {
    root: "/customer",
    home: "/customer/home",
    settings: "/customer/settings",
  },
  business: {
    root: "/business",
    dashboard: "/business/dashboard",
    settings: "/business/settings",
    onboarding: "/onboarding",
  },
};

export const BUSINESS_LOGIN_SESSION_EXPIRED_REASON = "session_expired";

export function getBusinessSessionExpiredLoginPath({ next } = {}) {
  const params = new URLSearchParams({
    reason: BUSINESS_LOGIN_SESSION_EXPIRED_REASON,
  });

  if (typeof next === "string" && next.trim()) {
    params.set("next", next);
  }

  return `${PATHS.auth.businessLogin}?${params.toString()}`;
}
