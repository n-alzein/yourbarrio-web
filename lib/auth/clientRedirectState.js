const REDIRECT_PARAM_KEYS = [
  "next",
  "returnUrl",
  "callbackUrl",
  "returnTo",
  "continue",
  "fromPath",
  "afterLogin",
  "postLogin",
];

const REDIRECT_STORAGE_KEYS = [
  "returnTo",
  "next",
  "callbackUrl",
  "postLoginRedirect",
  "yb:returnTo",
  "yb:postLoginRedirect",
  "business_auth_redirect",
  "business_auth_success",
];

export function getRequestedPathFromCurrentUrl() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search || "");
  for (const key of REDIRECT_PARAM_KEYS) {
    const value = params.get(key);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function readClientRedirectState() {
  if (typeof window === "undefined") return {};

  const state = {};
  const params = new URLSearchParams(window.location.search || "");
  for (const key of REDIRECT_PARAM_KEYS) {
    const value = params.get(key);
    if (value) state[`query.${key}`] = value;
  }

  try {
    REDIRECT_STORAGE_KEYS.forEach((key) => {
      const value = window.localStorage.getItem(key);
      if (value) state[`localStorage.${key}`] = value;
    });
  } catch {}

  try {
    REDIRECT_STORAGE_KEYS.forEach((key) => {
      const value = window.sessionStorage.getItem(key);
      if (value) state[`sessionStorage.${key}`] = value;
    });
  } catch {}

  return state;
}

export function clearClientRedirectState() {
  if (typeof window === "undefined") return;

  try {
    REDIRECT_STORAGE_KEYS.forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } catch {}

  try {
    REDIRECT_STORAGE_KEYS.forEach((key) => {
      window.sessionStorage.removeItem(key);
    });
  } catch {}

  REDIRECT_STORAGE_KEYS.forEach((name) => {
    document.cookie = `${name}=; path=/; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  });

  const url = new URL(window.location.href);
  let changed = false;
  REDIRECT_PARAM_KEYS.forEach((key) => {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  });
  if (changed) {
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, "", next);
  }
}
