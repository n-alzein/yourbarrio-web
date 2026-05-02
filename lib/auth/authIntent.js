import { getSafeRedirectPath } from "@/lib/auth/redirects";
import { PATHS } from "@/lib/auth/paths";

export const POST_LOGIN_REDIRECT_STORAGE_KEY = "yb:postLoginRedirect";
export const LOGIN_ROLE_STORAGE_KEY = "yb:loginRole";
export const CHECKOUT_INTENT_STORAGE_KEY = "yb:checkoutIntentPending";
export const CHECKOUT_INTENT_COOKIE_NAME = "yb_checkout_intent";
export const CHECKOUT_INTENT_UPDATED_EVENT = "yb:checkout-intent-updated";
export const CHECKOUT_HANDOFF_STATE_STORAGE_KEY = "yb:checkoutHandoffState";
export const CHECKOUT_HANDOFF_STATES = Object.freeze({
  idle: "idle",
  authenticating: "authenticating",
  mergingGuestCart: "mergingGuestCart",
  redirectingToCheckout: "redirectingToCheckout",
  failed: "failed",
});
const CHECKOUT_INTENT_MAX_AGE_MS = 10 * 60 * 1000;

function getWindowSessionStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function sanitizeAuthRedirectPath(input, fallbackPath = PATHS.public.root) {
  const safeFallback = getSafeRedirectPath(fallbackPath) || PATHS.public.root;
  const safePath = getSafeRedirectPath(input);
  return safePath || safeFallback;
}

function isCheckoutRedirectPath(path) {
  return typeof path === "string" && (path === "/checkout" || path.startsWith("/checkout?"));
}

function emitCheckoutIntentUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHECKOUT_INTENT_UPDATED_EVENT));
}

function writeCheckoutIntentCookie(payload) {
  if (typeof document === "undefined") return;
  const encoded = encodeURIComponent(JSON.stringify(payload));
  document.cookie = `${CHECKOUT_INTENT_COOKIE_NAME}=${encoded}; Path=/; Max-Age=${Math.round(
    CHECKOUT_INTENT_MAX_AGE_MS / 1000
  )}; SameSite=Lax`;
}

function clearCheckoutIntentCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${CHECKOUT_INTENT_COOKIE_NAME}=; Path=/; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

function readCheckoutIntentCookie() {
  if (typeof document === "undefined") return null;
  const entry = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${CHECKOUT_INTENT_COOKIE_NAME}=`));
  if (!entry) return null;
  try {
    return JSON.parse(decodeURIComponent(entry.split("=").slice(1).join("=")));
  } catch {
    clearCheckoutIntentCookie();
    return null;
  }
}

function normalizeCheckoutIntentPayload(payload) {
  const redirectTo = sanitizeAuthRedirectPath(payload?.redirectTo, "/checkout");
  const createdAt = Number(payload?.createdAt || 0);
  if (!isCheckoutRedirectPath(redirectTo) || !createdAt) return null;
  if (Date.now() - createdAt > CHECKOUT_INTENT_MAX_AGE_MS) return null;
  return { redirectTo, createdAt };
}

export function markCheckoutIntentPending(redirectTo) {
  const storage = getWindowSessionStorage();
  const safeRedirect = sanitizeAuthRedirectPath(redirectTo, "/checkout");
  if (!isCheckoutRedirectPath(safeRedirect)) return null;
  const payload = {
    redirectTo: safeRedirect,
    createdAt: Date.now(),
  };
  storage?.setItem(CHECKOUT_INTENT_STORAGE_KEY, JSON.stringify(payload));
  writeCheckoutIntentCookie(payload);
  emitCheckoutIntentUpdated();
  return payload;
}

export function readCheckoutIntentPending() {
  const storage = getWindowSessionStorage();
  const clearInvalid = () => {
    storage?.removeItem(CHECKOUT_INTENT_STORAGE_KEY);
    clearCheckoutIntentCookie();
    emitCheckoutIntentUpdated();
  };
  try {
    const storagePayload = storage
      ? JSON.parse(storage.getItem(CHECKOUT_INTENT_STORAGE_KEY) || "null")
      : null;
    const cookiePayload = readCheckoutIntentCookie();
    const normalized =
      normalizeCheckoutIntentPayload(storagePayload) ||
      normalizeCheckoutIntentPayload(cookiePayload);
    if (!normalized) {
      if (storagePayload || cookiePayload) clearInvalid();
      return null;
    }
    storage?.setItem(CHECKOUT_INTENT_STORAGE_KEY, JSON.stringify(normalized));
    writeCheckoutIntentCookie(normalized);
    return normalized;
  } catch {
    clearInvalid();
    return null;
  }
}

export function isCheckoutIntentPending() {
  return Boolean(readCheckoutIntentPending());
}

export function setCheckoutHandoffState(state) {
  const storage = getWindowSessionStorage();
  if (!storage) return CHECKOUT_HANDOFF_STATES.idle;
  const normalized = Object.values(CHECKOUT_HANDOFF_STATES).includes(state)
    ? state
    : CHECKOUT_HANDOFF_STATES.idle;
  if (normalized === CHECKOUT_HANDOFF_STATES.idle) {
    storage.removeItem(CHECKOUT_HANDOFF_STATE_STORAGE_KEY);
  } else {
    storage.setItem(CHECKOUT_HANDOFF_STATE_STORAGE_KEY, normalized);
  }
  emitCheckoutIntentUpdated();
  return normalized;
}

export function readCheckoutHandoffState() {
  const storage = getWindowSessionStorage();
  if (!storage) return CHECKOUT_HANDOFF_STATES.idle;
  const value = storage.getItem(CHECKOUT_HANDOFF_STATE_STORAGE_KEY);
  return Object.values(CHECKOUT_HANDOFF_STATES).includes(value)
    ? value
    : CHECKOUT_HANDOFF_STATES.idle;
}

export function clearCheckoutIntentPending() {
  const storage = getWindowSessionStorage();
  storage?.removeItem(CHECKOUT_INTENT_STORAGE_KEY);
  storage?.removeItem(CHECKOUT_HANDOFF_STATE_STORAGE_KEY);
  clearCheckoutIntentCookie();
  emitCheckoutIntentUpdated();
}

export function setAuthIntent({ redirectTo, role } = {}) {
  const storage = getWindowSessionStorage();
  if (!storage) return null;

  const normalizedRole = role === "business" ? "business" : "customer";
  const fallbackPath =
    normalizedRole === "business"
      ? PATHS.public.businessLanding
      : PATHS.public.root;
  const safeRedirect = sanitizeAuthRedirectPath(redirectTo, fallbackPath);

  storage.setItem(POST_LOGIN_REDIRECT_STORAGE_KEY, safeRedirect);
  storage.setItem(LOGIN_ROLE_STORAGE_KEY, normalizedRole);
  if (normalizedRole === "customer" && isCheckoutRedirectPath(safeRedirect)) {
    markCheckoutIntentPending(safeRedirect);
  } else {
    clearCheckoutIntentPending();
  }
  return safeRedirect;
}

export function readAuthIntent() {
  const storage = getWindowSessionStorage();
  if (!storage) return { redirectTo: null, role: null };

  return {
    redirectTo: sanitizeAuthRedirectPath(
      storage.getItem(POST_LOGIN_REDIRECT_STORAGE_KEY),
      PATHS.public.root
    ),
    role: storage.getItem(LOGIN_ROLE_STORAGE_KEY) || null,
  };
}

export function clearAuthIntent() {
  const storage = getWindowSessionStorage();
  if (!storage) return;
  storage.removeItem(POST_LOGIN_REDIRECT_STORAGE_KEY);
  storage.removeItem(LOGIN_ROLE_STORAGE_KEY);
}

export function consumeAuthIntent({ role, fallbackPath } = {}) {
  const { redirectTo, role: storedRole } = readAuthIntent();
  const normalizedRole = role || storedRole || "customer";
  const resolvedFallback =
    fallbackPath ||
    (normalizedRole === "business"
      ? PATHS.public.businessLanding
      : PATHS.public.root);
  const safeRedirect = sanitizeAuthRedirectPath(redirectTo, resolvedFallback);
  clearAuthIntent();
  return safeRedirect;
}

export function requestCustomerLogin({ router, redirectTo } = {}) {
  setAuthIntent({ redirectTo, role: "customer" });
  router?.push(PATHS.auth.customerLogin);
}

export function requestBusinessLogin({ router, redirectTo } = {}) {
  setAuthIntent({ redirectTo, role: "business" });
  router?.push(PATHS.auth.businessLogin);
}
