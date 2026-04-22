// lib/supabaseClient.js
import { createBrowserClient } from "@supabase/ssr";
import { redactKey } from "./redactKey";

let supabase = null;
let getSessionPromise = null;
let tokenRequestPromise = null;
let authCooldownUntil = 0;
let authBackoffMs = 0;
let authInvalidTokenAt = 0;
let refreshDisabledUntil = 0;
let refreshDisabledReason = null;
let refreshInFlight = null;
let refreshLastAt = 0;
const authGuardListeners = new Set();

const AUTH_BACKOFF_BASE_MS = 30000;
const AUTH_BACKOFF_MAX_MS = 60000;
const AUTH_REFRESH_COOLDOWN_MS = 10000;
const AUTH_INVALID_REFRESH_DISABLE_MS = 60000;

const authDiagEnabled = () => process.env.NEXT_PUBLIC_AUTH_DIAG === "1";
const debugSupabaseEmailEnabled = () =>
  process.env.NEXT_PUBLIC_DEBUG_SUPABASE_EMAIL === "1";

function isSupabaseEmailEndpoint(urlString) {
  if (!urlString) return false;
  return (
    urlString.includes("/auth/v1/otp") ||
    urlString.includes("/auth/v1/signup") ||
    urlString.includes("/auth/v1/invite")
  );
}

function sanitizeUrlForLog(url) {
  if (!url) return url;
  const raw = String(url);
  if (raw.includes("realtime/v1/websocket") || raw.includes("apikey=")) {
    return raw.split("?")[0];
  }
  try {
    const parsed = new URL(raw);
    if (parsed.searchParams.has("apikey")) {
      parsed.searchParams.set("apikey", redactKey(parsed.searchParams.get("apikey")));
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

function notifyAuthGuard() {
  const snapshot = getAuthGuardState();
  authGuardListeners.forEach((listener) => listener(snapshot));
}

export function subscribeAuthGuard(listener) {
  authGuardListeners.add(listener);
  return () => {
    authGuardListeners.delete(listener);
  };
}

export function getAuthGuardState() {
  const now = Date.now();
  if (refreshDisabledUntil && now >= refreshDisabledUntil) {
    refreshDisabledUntil = 0;
    refreshDisabledReason = null;
  }
  return {
    cooldownUntil: authCooldownUntil,
    cooldownMsRemaining: Math.max(0, authCooldownUntil - now),
    backoffMs: authBackoffMs,
    tokenInvalidAt: authInvalidTokenAt,
    refreshDisabledUntil,
    refreshDisabledMsRemaining: Math.max(0, refreshDisabledUntil - now),
    refreshDisabledReason,
  };
}

export function acknowledgeAuthTokenInvalid(tokenInvalidAt) {
  if (authInvalidTokenAt && authInvalidTokenAt <= tokenInvalidAt) {
    authInvalidTokenAt = 0;
    notifyAuthGuard();
  }
}

function setAuthCooldown(status, url) {
  const now = Date.now();
  const nextBackoff = authBackoffMs
    ? Math.min(AUTH_BACKOFF_MAX_MS, authBackoffMs * 2)
    : AUTH_BACKOFF_BASE_MS;
  const jitter = Math.floor(nextBackoff * (0.2 * Math.random()));
  authBackoffMs = nextBackoff;
  authCooldownUntil = now + nextBackoff + jitter;
  if (authDiagEnabled()) {
    console.warn("[AUTH_DIAG] auth token rate limited", {
      status,
      url: sanitizeUrlForLog(url),
      cooldownMs: authCooldownUntil - now,
    });
  }
  notifyAuthGuard();
}

function setAuthCooldownUntil(cooldownMs, status, url) {
  const now = Date.now();
  const nextUntil = now + cooldownMs;
  authCooldownUntil = Math.max(authCooldownUntil, nextUntil);
  authBackoffMs = Math.max(authBackoffMs, cooldownMs);
  if (authDiagEnabled()) {
    console.warn("[AUTH_DIAG] auth token cooldown", {
      status,
      url: sanitizeUrlForLog(url),
      cooldownMs,
    });
  }
  notifyAuthGuard();
}

function clearAuthCooldown() {
  if (!authCooldownUntil && !authBackoffMs) return;
  authCooldownUntil = 0;
  authBackoffMs = 0;
  notifyAuthGuard();
}

function markAuthTokenInvalid(status, url) {
  authInvalidTokenAt = Date.now();
  if (authDiagEnabled()) {
    console.warn("[AUTH_DIAG] auth token invalid", {
      status,
      url: sanitizeUrlForLog(url),
    });
  }
  notifyAuthGuard();
}

function setRefreshDisabled(ms, reason, metadata = {}) {
  const now = Date.now();
  const nextUntil = now + ms;
  if (nextUntil <= refreshDisabledUntil) return;
  refreshDisabledUntil = nextUntil;
  refreshDisabledReason = reason || refreshDisabledReason;
  if (authDiagEnabled()) {
    console.warn("[AUTH_DIAG] auth refresh disabled", {
      reason,
      cooldownMs: ms,
      ...metadata,
    });
  }
  notifyAuthGuard();
}

function isAuthCooldownActive() {
  return Date.now() < authCooldownUntil;
}

function isRefreshDisabled() {
  return Date.now() < refreshDisabledUntil;
}

function authDiagLog(label, payload = {}) {
  if (!authDiagEnabled() || typeof window === "undefined") return;
  const timestamp = new Date().toISOString();
  console.log("[AUTH_DIAG]", {
    timestamp,
    pathname: window.location.pathname,
    search: window.location.search,
    label,
    ...payload,
  });
}

function isSupabaseAuthStorageKey(key) {
  return (
    typeof key === "string" &&
    key.startsWith("sb-") &&
    (key.endsWith("-auth-token") || key.endsWith("-auth-token-user"))
  );
}

function looksLikeSessionObject(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (typeof value.access_token === "string" ||
      typeof value.refresh_token === "string" ||
      Boolean(value.user?.id))
  );
}

function looksLikeUserStorageObject(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Boolean(value.user?.id)
  );
}

export function __normalizeSupabaseAuthStorageValue(rawValue, key) {
  if (!isSupabaseAuthStorageKey(key) || typeof rawValue !== "string" || rawValue === "") {
    return { value: rawValue, changed: false, clear: false, reason: null };
  }

  let parsed;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return {
      value: null,
      changed: true,
      clear: true,
      reason: "malformed_json",
    };
  }

  if (looksLikeSessionObject(parsed) || looksLikeUserStorageObject(parsed)) {
    return { value: rawValue, changed: false, clear: false, reason: null };
  }

  if (typeof parsed === "string") {
    try {
      const inner = JSON.parse(parsed);
      if (looksLikeSessionObject(inner) || looksLikeUserStorageObject(inner)) {
        return {
          value: parsed,
          changed: true,
          clear: false,
          reason: "double_serialized_session",
        };
      }
    } catch {
      return {
        value: null,
        changed: true,
        clear: true,
        reason: "double_serialized_malformed_json",
      };
    }
  }

  return {
    value: null,
    changed: true,
    clear: true,
    reason: "invalid_session_shape",
  };
}

function createSupabaseStorageAdapter() {
  if (typeof window === "undefined") return undefined;
  let storage = null;
  try {
    storage = window.localStorage;
  } catch {
    return undefined;
  }
  if (!storage) return undefined;
  return {
    getItem(key) {
      try {
        const rawValue = storage.getItem(key);
        const normalized = __normalizeSupabaseAuthStorageValue(rawValue, key);
        if (normalized.changed) {
          authDiagLog("auth:storage:normalize", {
            key,
            reason: normalized.reason,
            cleared: normalized.clear,
          });
          if (normalized.clear) {
            storage.removeItem(key);
          } else if (typeof normalized.value === "string") {
            storage.setItem(key, normalized.value);
          }
        }
        return normalized.value;
      } catch (error) {
        authDiagLog("auth:storage:get:failed", {
          key,
          message: error?.message || String(error),
        });
        return null;
      }
    },
    setItem(key, value) {
      try {
        storage.setItem(key, value);
      } catch (error) {
        authDiagLog("auth:storage:set:failed", {
          key,
          message: error?.message || String(error),
        });
      }
    },
    removeItem(key) {
      try {
        storage.removeItem(key);
      } catch (error) {
        authDiagLog("auth:storage:remove:failed", {
          key,
          message: error?.message || String(error),
        });
      }
    },
  };
}

function isInvalidRefreshMessage(message) {
  if (!message) return false;
  const lowered = String(message).toLowerCase();
  return (
    lowered.includes("invalid refresh token") ||
    lowered.includes("refresh token not found") ||
    lowered.includes("invalid_grant")
  );
}

function getGrantType(init) {
  if (!init?.body) return null;
  const body = init.body;
  if (typeof body === "string") {
    const params = new URLSearchParams(body);
    return params.get("grant_type");
  }
  if (body instanceof URLSearchParams) {
    return body.get("grant_type");
  }
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return body.get("grant_type");
  }
  if (typeof body?.get === "function") {
    try {
      return body.get("grant_type");
    } catch {
      return null;
    }
  }
  return null;
}

async function readJsonBody(response) {
  try {
    const clone = response.clone();
    return await clone.json();
  } catch {
    return null;
  }
}

async function getCooldownMsFromResponse(response) {
  const retryAfter = response.headers?.get?.("Retry-After");
  if (retryAfter) {
    const retrySeconds = Number(retryAfter);
    if (!Number.isNaN(retrySeconds) && retrySeconds > 0) {
      return retrySeconds * 1000;
    }
  }

  const data = await readJsonBody(response);
  const raw =
    data?.cooldownMs ??
    data?.cooldown_ms ??
    data?.retry_after_ms ??
    data?.retryAfterMs;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function responseIndicatesInvalidRefresh(response) {
  if (response.status !== 400) return false;
  const data = await readJsonBody(response);
  const message =
    data?.error_description ||
    data?.error ||
    data?.message ||
    data?.msg ||
    "";
  return isInvalidRefreshMessage(message) || response.status === 400;
}

function createSupabaseFetch() {
  const baseFetch = (...args) => fetch(...args);
  return async (input, init) => {
    const url = typeof input === "string" ? input : input?.url;
    const urlString = url ? String(url) : "";
    if (debugSupabaseEmailEnabled() && isSupabaseEmailEndpoint(urlString)) {
      console.error("[supabase-email-trigger]", {
        url: sanitizeUrlForLog(urlString),
        method: init?.method || "GET",
      });
      console.error("[supabase-email-trigger stack]", new Error().stack);
    }
    const isTokenRequest =
      urlString.includes("/auth/v1/token") || urlString.includes("token");
    const grantType = getGrantType(init);
    const isRefreshRequest = grantType === "refresh_token";

    if (isTokenRequest) {
      if (authDiagEnabled()) {
        authDiagLog("fetch:token", {
          url: urlString,
          stack: new Error().stack,
        });
      }

      if (isRefreshRequest && isRefreshDisabled()) {
        const cooldownMs = Math.max(0, refreshDisabledUntil - Date.now());
        authDiagLog("fetch:token:skip", {
          reason: "refresh_disabled",
          cooldownMs,
        });
        return new Response(
          JSON.stringify({ error: "refresh_disabled", retry_after_ms: cooldownMs }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(Math.ceil(cooldownMs / 1000)),
            },
          }
        );
      }

      if (isRefreshRequest && isAuthCooldownActive()) {
        const cooldown = getAuthGuardState();
        authDiagLog("fetch:token:skip", {
          reason: "rate_limited",
          cooldownMs: cooldown.cooldownMsRemaining,
        });
        return new Response(
          JSON.stringify({ error: "rate_limited", retry_after_ms: cooldown.cooldownMsRemaining }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(Math.ceil(cooldown.cooldownMsRemaining / 1000)),
            },
          }
        );
      }

      if (isRefreshRequest && tokenRequestPromise) {
        return tokenRequestPromise;
      }

      const doFetch = baseFetch(input, init);
      if (!isRefreshRequest) {
        return doFetch;
      }

      tokenRequestPromise = doFetch
        .then(async (response) => {
          if (response.status === 429) {
            const cooldownMs = await getCooldownMsFromResponse(response);
            if (cooldownMs) {
              setAuthCooldownUntil(cooldownMs, response.status, urlString);
              setRefreshDisabled(cooldownMs, "rate_limit", {
                status: response.status,
                url: urlString,
              });
            } else {
              setAuthCooldown(response.status, urlString);
            }
          } else if (response.status === 400) {
            const invalid = await responseIndicatesInvalidRefresh(response);
            if (invalid) {
              markAuthTokenInvalid(response.status, urlString);
              setRefreshDisabled(AUTH_INVALID_REFRESH_DISABLE_MS, "invalid_token", {
                status: response.status,
                url: urlString,
              });
            } else {
              setAuthCooldown(response.status, urlString);
            }
          } else if (response.ok) {
            clearAuthCooldown();
          }
          return response;
        })
        .catch((err) => {
          if (authDiagEnabled()) {
            authDiagLog("fetch:token:error", {
              url: urlString,
              message: err?.message || String(err),
            });
          }
          throw err;
        })
        .finally(() => {
          tokenRequestPromise = null;
        });

      return tokenRequestPromise;
    }

    return baseFetch(input, init);
  };
}

export function getCookieName() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return undefined;
  return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}

export function resetSupabaseClient() {
  console.log("Resetting Supabase client singleton");
  supabase = null;
  if (typeof globalThis !== "undefined") {
    globalThis.__ybSupabaseClient = null;
    globalThis.__ybSupabaseClientId = null;
  }
}

export function getSupabaseBrowserClient() {
  if (typeof window === "undefined") return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    if (process.env.NODE_ENV !== "production") {
      const missing = [];
      if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
      if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
      throw new Error(`Missing Supabase env: ${missing.join(", ")}`);
    }
    return null;
  }
  const globalScope = typeof globalThis !== "undefined" ? globalThis : null;
  if (!supabase && globalScope?.__ybSupabaseClient) {
    supabase = globalScope.__ybSupabaseClient;
  }
  if (supabase) return supabase;

  try {
    supabase = createBrowserClient(
      url,
      anonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storage: createSupabaseStorageAdapter(),
        },
        global: {
          fetch: createSupabaseFetch(),
        },
      }
    );
    if (globalScope) {
      globalScope.__ybSupabaseClient = supabase;
      if (
        process.env.NODE_ENV !== "production" &&
        !globalScope.__ybSupabaseClientId
      ) {
        const clientId = `sb-${Math.random().toString(36).slice(2, 10)}`;
        globalScope.__ybSupabaseClientId = clientId;
        console.info("[SUPABASE] browser client created", { clientId });
      }
    }

    const originalGetSession = supabase.auth.getSession.bind(supabase.auth);
    supabase.auth.getSession = async (...args) => {
      if (getSessionPromise) return getSessionPromise;
      authDiagLog("auth:getSession", {
        stack: new Error().stack,
      });
      getSessionPromise = originalGetSession(...args).finally(() => {
        getSessionPromise = null;
      });
      return getSessionPromise;
    };

    if (typeof supabase.auth.refreshSession === "function") {
      const originalRefreshSession = supabase.auth.refreshSession.bind(
        supabase.auth
      );
      supabase.auth.refreshSession = async (...args) => {
        if (refreshInFlight) {
          authDiagLog("auth:refreshSession:skip", { reason: "in_flight" });
          return refreshInFlight;
        }
        if (isRefreshDisabled()) {
          authDiagLog("auth:refreshSession:skip", {
            reason: "refresh_disabled",
            disabledMsRemaining: Math.max(0, refreshDisabledUntil - Date.now()),
          });
          return { data: { session: null }, error: null };
        }
        const now = Date.now();
        if (now - refreshLastAt < AUTH_REFRESH_COOLDOWN_MS) {
          authDiagLog("auth:refreshSession:skip", {
            reason: "cooldown",
            cooldownMs: AUTH_REFRESH_COOLDOWN_MS - (now - refreshLastAt),
          });
          return { data: { session: null }, error: null };
        }
        authDiagLog("auth:refreshSession", {
          stack: new Error().stack,
        });
        refreshLastAt = now;
        refreshInFlight = originalRefreshSession(...args)
          .then((result) => {
            authDiagLog("auth:refreshSession:end", {
              ok: !result?.error,
              status: result?.error?.status,
              message: result?.error?.message,
            });
            const error = result?.error;
            if (error) {
              if (
                error?.status === 400 ||
                isInvalidRefreshMessage(error?.message)
              ) {
                markAuthTokenInvalid(error?.status, "refreshSession");
                setRefreshDisabled(AUTH_INVALID_REFRESH_DISABLE_MS, "invalid_token", {
                  status: error?.status,
                  message: error?.message,
                });
              }
            }
            return result;
          })
          .catch((err) => {
            authDiagLog("auth:refreshSession:end", {
              ok: false,
              status: err?.status,
              message: err?.message || String(err),
            });
            if (isInvalidRefreshMessage(err?.message)) {
              markAuthTokenInvalid(err?.status, "refreshSession");
              setRefreshDisabled(AUTH_INVALID_REFRESH_DISABLE_MS, "invalid_token", {
                status: err?.status,
                message: err?.message,
              });
            }
            throw err;
          })
          .finally(() => {
            refreshInFlight = null;
          });
        return refreshInFlight;
      };
    }

      const originalGetUser = supabase.auth.getUser.bind(supabase.auth);
      supabase.auth.getUser = async (...args) => {
        authDiagLog("auth:getUser", { stack: new Error().stack });
        if (!args[0]) {
          try {
            const { data } = await supabase.auth.getSession();
            if (!data?.session) {
              return { data: { user: null }, error: null };
            }
          } catch {
            return { data: { user: null }, error: null };
          }
        }
        return originalGetUser(...args);
      };

    const wrapAuthMethod = (name) => {
      const original = supabase.auth[name]?.bind(supabase.auth);
      if (!original) return;
      supabase.auth[name] = async (...args) => {
        authDiagLog(`auth:${name}`, { stack: new Error().stack });
        return original(...args);
      };
    };

    [
      "exchangeCodeForSession",
      "signInWithOAuth",
      "signInWithPassword",
      "signUp",
    ].forEach(wrapAuthMethod);
  } catch (err) {
    console.error("Failed to initialize Supabase browser client", err);
    return null;
  }

  return supabase;
}

export function getFreshBrowserSupabaseClient() {
  if (authDiagEnabled()) {
    authDiagLog("auth:client:reuse", {
      message: "Fresh client requested; returning singleton to avoid refresh loops.",
    });
  }
  return getSupabaseBrowserClient();
}

export function clearSupabaseAuthStorage() {
  if (typeof window === "undefined") return;
  const storageKey =
    supabase?.auth?.storageKey ||
    getCookieName() ||
    null;
  try {
    if (storageKey) {
      localStorage.removeItem(storageKey);
      sessionStorage.removeItem(storageKey);
    } else {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
          localStorage.removeItem(key);
        }
      });
      Object.keys(sessionStorage).forEach((key) => {
        if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
          sessionStorage.removeItem(key);
        }
      });
    }
  } catch (err) {
    if (authDiagEnabled()) {
      authDiagLog("auth:storage:clear:failed", {
        message: err?.message || String(err),
      });
    }
  }
}
