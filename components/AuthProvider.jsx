"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  acknowledgeAuthTokenInvalid,
  getAuthGuardState,
  getSupabaseBrowserClient,
  clearSupabaseAuthStorage,
  getCookieName,
  resetSupabaseClient,
  subscribeAuthGuard,
} from "@/lib/supabase/browser";
import {
  clearVerifiedUserCache,
} from "@/lib/auth/verifiedUserClient";
import { PATHS } from "@/lib/auth/paths";
import AuthStateDebug from "@/components/debug/AuthStateDebug";
import { stopRealtime } from "@/lib/realtimeManager";
import {
  isLogoutRedirectInFlight,
  performLogout,
  resolveLogoutRedirect,
} from "@/lib/auth/logout";
import { getPostLoginRedirect } from "@/lib/auth/redirects";
import { clearClientRedirectState, readClientRedirectState } from "@/lib/auth/clientRedirectState";

const AuthContext = createContext({
  supabase: null,
  authStatus: "loading",
  session: null,
  status: "loading",
  user: null,
  profile: null,
  role: null,
  error: null,
  lastAuthEvent: null,
  lastError: null,
  loadingUser: true,
  rateLimited: false,
  rateLimitUntil: 0,
  rateLimitMessage: null,
  refreshDisabledUntil: 0,
  refreshDisabledReason: null,
  authBusy: false,
  authAction: null,
  authAttemptId: 0,
  authActionStartedAt: 0,
  providerInstanceId: null,
  refreshProfile: async () => {},
  logout: async (_options = {}) => {},
  beginAuthAttempt: () => 0,
  endAuthAttempt: () => false,
  resetAuthUiState: () => {},
  seedAuthState: () => {},
  supportModeActive: false,
});

const resolveRole = (profile, user, fallbackRole) => {
  return profile?.role ?? fallbackRole ?? user?.app_metadata?.role ?? null;
};

const isPublicBusinessPath = (pathname) => {
  if (!pathname) return false;
  return (
    pathname === "/business" ||
    pathname === "/business/" ||
    pathname.startsWith("/business/about") ||
    pathname.startsWith("/business/login")
  );
};

const isProtectedPath = (pathname) => {
  if (!pathname) return false;
  if (isPublicBusinessPath(pathname)) return false;
  if (pathname.startsWith("/business/")) return true;
  if (pathname.startsWith("/customer")) return true;
  if (pathname.startsWith("/account")) return true;
  if (pathname.startsWith("/checkout")) return true;
  if (pathname.startsWith("/orders")) return true;
  return false;
};

const buildSignedOutState = () => ({
  authStatus: "unauthenticated",
  session: null,
  user: null,
  profile: null,
  role: null,
  error: null,
});

const buildSignedInState = ({ user, profile }) => ({
  authStatus: "authenticated",
  user: user ?? null,
  profile: profile ?? null,
  role: resolveRole(profile, user, null),
  error: null,
});

const withGuardState = (base) => ({
  ...base,
  rateLimited: authStore.state.rateLimited,
  rateLimitUntil: authStore.state.rateLimitUntil,
  rateLimitMessage: authStore.state.rateLimitMessage,
  tokenInvalidAt: authStore.state.tokenInvalidAt,
});

const authStore = {
  state: {
    authStatus: "loading",
    session: null,
    user: null,
    profile: null,
    role: null,
    error: null,
    lastAuthEvent: null,
    lastError: null,
    rateLimited: false,
    rateLimitUntil: 0,
    rateLimitMessage: null,
    tokenInvalidAt: 0,
    refreshDisabledUntil: 0,
    refreshDisabledReason: null,
    authBusy: false,
    authAction: null,
    authAttemptId: 0,
    authActionStartedAt: 0,
    supportModeActive: false,
  },
  listeners: new Set(),
  supabase: null,
  bootstrapPromise: null,
  profilePromise: null,
  profileUserId: null,
  providerCount: 0,
  guardSubscribed: false,
  authUnsubscribe: null,
  loggingOut: false,
  logoutRedirectInFlight: false,
  providerInstanceId: null,
  bootstrapAbortController: null,
};

let handledTokenInvalidAt = 0;
const authDiagEnabled =
  process.env.NEXT_PUBLIC_AUTH_DIAG === "1" &&
  process.env.NODE_ENV !== "production";
const autoRefreshDisabled =
  process.env.NEXT_PUBLIC_DISABLE_AUTO_REFRESH === "1" ||
  process.env.NEXT_PUBLIC_DISABLE_AUTO_REFRESH === "true";
export const AUTH_UI_RESET_EVENT = "yb-auth-ui-reset";
const AUTO_REFRESH_BLOCKED_EVENT = "yb-auto-refresh-blocked";
const AUTO_REFRESH_RETRY_EVENT = "yb-auto-refresh-retry";
const AUTO_REFRESH_WINDOW_MS = 10_000;
const AUTO_REFRESH_MAX_ATTEMPTS = 2;
const AUTO_REFRESH_COOLDOWN_MS = 30_000;
const AUTO_REFRESH_MIN_INTERVAL_MS = 2_500;
const PROFILE_RETRY_WINDOW_MS = 10_000;
const PROFILE_MAX_FAILURES = 2;
const PROFILE_COOLDOWN_MS = 30_000;

let authClickTracerRefs = 0;
let authClickTracerCleanup = null;
let autoRefreshAttemptTimestamps = [];
let autoRefreshBlockedUntil = 0;
let lastAutoRefreshAt = 0;
let profileFetchFailureTimestamps = [];
let profileFetchBlockedUntil = 0;
let profileFetchInFlight = null;
let profileFetchInFlightUserId = null;
const AUTO_REFRESH_GUARD_KEY = "yb_auto_refresh_guard";

function readRefreshGuardState() {
  if (typeof window === "undefined") {
    return {
      attempts: autoRefreshAttemptTimestamps,
      blockedUntil: autoRefreshBlockedUntil,
      lastRefreshAt: lastAutoRefreshAt,
    };
  }
  try {
    const raw = window.sessionStorage.getItem(AUTO_REFRESH_GUARD_KEY);
    if (!raw) {
      return {
        attempts: autoRefreshAttemptTimestamps,
        blockedUntil: autoRefreshBlockedUntil,
        lastRefreshAt: lastAutoRefreshAt,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      attempts: Array.isArray(parsed?.attempts)
        ? parsed.attempts.filter((n) => typeof n === "number")
        : [],
      blockedUntil:
        typeof parsed?.blockedUntil === "number" ? parsed.blockedUntil : 0,
      lastRefreshAt:
        typeof parsed?.lastRefreshAt === "number" ? parsed.lastRefreshAt : 0,
    };
  } catch {
    return {
      attempts: autoRefreshAttemptTimestamps,
      blockedUntil: autoRefreshBlockedUntil,
      lastRefreshAt: lastAutoRefreshAt,
    };
  }
}

function writeRefreshGuardState(next) {
  const normalized = {
    attempts: Array.isArray(next?.attempts)
      ? next.attempts.filter((n) => typeof n === "number")
      : [],
    blockedUntil: typeof next?.blockedUntil === "number" ? next.blockedUntil : 0,
    lastRefreshAt: typeof next?.lastRefreshAt === "number" ? next.lastRefreshAt : 0,
  };
  autoRefreshAttemptTimestamps = normalized.attempts;
  autoRefreshBlockedUntil = normalized.blockedUntil;
  lastAutoRefreshAt = normalized.lastRefreshAt;
  if (typeof window === "undefined") return;
  try {
    if (
      normalized.attempts.length === 0 &&
      normalized.blockedUntil === 0 &&
      normalized.lastRefreshAt === 0
    ) {
      window.sessionStorage.removeItem(AUTO_REFRESH_GUARD_KEY);
      return;
    }
    window.sessionStorage.setItem(
      AUTO_REFRESH_GUARD_KEY,
      JSON.stringify(normalized)
    );
  } catch {
    // best effort
  }
}

function emitAuthState() {
  authStore.listeners.forEach((listener) => listener());
}

function setAuthState(nextState) {
  authStore.state = nextState;
  emitAuthState();
}

function updateAuthState(partial) {
  setAuthState({ ...authStore.state, ...partial });
}

function logAuthDiag(event, payload = {}) {
  if (!authDiagEnabled || typeof window === "undefined") return;
  console.log("[AUTH_DIAG]", {
    event,
    pathname: window.location.pathname,
    authStatus: authStore.state.authStatus,
    authBusy: authStore.state.authBusy,
    authAction: authStore.state.authAction,
    authAttemptId: authStore.state.authAttemptId,
    providerInstanceId: authStore.providerInstanceId,
    userId: authStore.state.user?.id ?? null,
    ...payload,
  });
}

function emitAuthUiReset(reason) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(AUTH_UI_RESET_EVENT, {
      detail: { reason, ts: Date.now() },
    })
  );
  logAuthDiag("ui:reset", { reason });
}

function isAuthNavigationSuppressed() {
  return (
    authStore.loggingOut ||
    authStore.logoutRedirectInFlight ||
    isLogoutRedirectInFlight()
  );
}

function clearSupabaseCookiesClient() {
  if (typeof document === "undefined") return;
  const cookieName = getCookieName();
  const names = document.cookie
    .split(";")
    .map((entry) => entry.trim().split("=")[0])
    .filter(Boolean)
    .filter((name) => name.startsWith("sb-") || name === cookieName);

  const hostname = window.location.hostname || "";
  const domains = [undefined];
  if (hostname.endsWith("yourbarrio.com")) {
    domains.push(".yourbarrio.com", "www.yourbarrio.com");
  }

  names.forEach((name) => {
    domains.forEach((domain) => {
      const domainAttr = domain ? `domain=${domain};` : "";
      document.cookie = `${name}=; ${domainAttr} path=/; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
    });
  });

  try {
    localStorage.removeItem("business_auth_redirect");
    localStorage.removeItem("business_auth_success");
    localStorage.removeItem("signup_role");
  } catch {
    // ignore
  }
  try {
    sessionStorage.removeItem("yb_auto_logged_out");
    sessionStorage.removeItem("auth_flow_id");
  } catch {
    // ignore
  }
  clearClientRedirectState();
}

function describeNode(node) {
  if (!node || !node.tagName) return null;
  const id = node.id ? `#${node.id}` : "";
  const className =
    typeof node.className === "string" && node.className.trim()
      ? `.${node.className.trim().split(/\s+/).slice(0, 3).join(".")}`
      : "";
  return `${node.tagName.toLowerCase()}${id}${className}`;
}

function attachAuthClickTracer() {
  if (typeof window === "undefined") return () => {};
  const overlaySelectors = [
    "div[data-mobile-sidebar-drawer=\"1\"]",
    "#modal-root",
    "[aria-modal=\"true\"]",
  ];

  const handler = (event) => {
    const x = typeof event.clientX === "number" ? event.clientX : null;
    const y = typeof event.clientY === "number" ? event.clientY : null;
    const target = event.target;
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const pathSummary = path
      .slice(0, 6)
      .map((node) => describeNode(node))
      .filter(Boolean);
    const hit =
      x !== null && y !== null ? document.elementFromPoint(x, y) : null;
    const nav =
      document.querySelector("nav[data-nav-guard]") ||
      document.querySelector("nav[data-business-navbar]") ||
      document.querySelector("nav[data-nav-surface]") ||
      document.querySelector("nav[data-public-nav]") ||
      document.querySelector("nav");
    const overlayNodes = overlaySelectors
      .map((selector) => ({ selector, node: document.querySelector(selector) }))
      .filter(({ node }) => node);
    const overlayHit = overlayNodes.find(({ node }) => hit && node.contains(hit));

    console.log("[AUTH_DIAG] click:capture", {
      type: event.type,
      coords: { x, y },
      target: describeNode(target),
      path: pathSummary,
      elementFromPoint: describeNode(hit),
      inNavbar: Boolean(nav && hit && nav.contains(hit)),
      overlayHit: overlayHit
        ? { selector: overlayHit.selector, node: describeNode(overlayHit.node) }
        : null,
    });
  };

  window.addEventListener("pointerdown", handler, true);
  window.addEventListener("click", handler, true);
  return () => {
    window.removeEventListener("pointerdown", handler, true);
    window.removeEventListener("click", handler, true);
  };
}

function buildAuthUiResetState(reason) {
  const nextAttemptId = authStore.state.authAttemptId + 1;
  logAuthDiag("auth_ui:reset", { reason, nextAttemptId });
  return {
    authBusy: false,
    authAction: null,
    authAttemptId: nextAttemptId,
    authActionStartedAt: 0,
  };
}

function applySignedOutState(reason = "signed_out", options = {}) {
  const {
    resetGuardState = false,
    clearAuthSuppression = false,
    extraState = null,
    resetAuthUi = true,
  } = options;

  if (resetGuardState) {
    writeRefreshGuardState({
      attempts: [],
      blockedUntil: 0,
      lastRefreshAt: 0,
    });
  }

  if (authStore.bootstrapAbortController?.abort) {
    authStore.bootstrapAbortController.abort();
  }
  authStore.bootstrapAbortController = null;
  authStore.bootstrapPromise = null;
  authStore.profilePromise = null;
  authStore.profileUserId = null;

  if (clearAuthSuppression) {
    authStore.loggingOut = false;
  }

  const signedOutBase = resetGuardState
    ? {
        ...buildSignedOutState(),
        rateLimited: false,
        rateLimitUntil: 0,
        rateLimitMessage: null,
        tokenInvalidAt: 0,
      }
    : withGuardState(buildSignedOutState());

  const authUiState = resetAuthUi
    ? buildAuthUiResetState(`signed_out:${reason}`)
    : null;

  updateAuthState({
    ...signedOutBase,
    ...(authUiState || {}),
    ...(extraState || {}),
  });

  logAuthDiag("auth:signed_out:applied", { reason, resetGuardState });
}

function beginAuthAttempt(action) {
  const nextAttemptId = authStore.state.authAttemptId + 1;
  updateAuthState({
    authBusy: true,
    authAction: action || null,
    authAttemptId: nextAttemptId,
    authActionStartedAt: Date.now(),
    lastError: null,
  });
  logAuthDiag("auth:attempt:begin", { action, attemptId: nextAttemptId });
  return nextAttemptId;
}

function endAuthAttempt(attemptId, result) {
  if (attemptId !== authStore.state.authAttemptId) {
    logAuthDiag("auth:attempt:end:ignored", {
      attemptId,
      currentAttemptId: authStore.state.authAttemptId,
      result,
    });
    return false;
  }

  updateAuthState({
    authBusy: false,
    authAction: null,
    authActionStartedAt: 0,
  });
  logAuthDiag("auth:attempt:end", { attemptId, result });
  return true;
}

function resetAuthUiState(reason) {
  updateAuthState(buildAuthUiResetState(reason));
}

async function cleanupRealtimeChannels() {
  await stopRealtime(authStore.supabase);
}

function setAuthError(error) {
  if (!error) return;
  const message = error?.message || String(error);
  updateAuthState({
    error,
    lastError: message,
  });
}

function subscribeAuthState(listener) {
  authStore.listeners.add(listener);
  return () => {
    authStore.listeners.delete(listener);
  };
}

function getAuthStateSnapshot() {
  return authStore.state;
}

function seedAuthState({
  initialUser,
  initialProfile,
  initialRole,
  supportModeActive = false,
}) {
  if (!initialUser && !initialProfile && !initialRole && !supportModeActive) {
    return;
  }

  const nextState = { ...authStore.state };
  let changed = false;

  if (supportModeActive) {
    const nextUser = initialUser ?? null;
    const nextProfile = initialProfile ?? null;
    const nextRole = resolveRole(nextProfile, nextUser, initialRole ?? "customer");
    if (
      nextState.user?.id !== nextUser?.id ||
      nextState.profile?.id !== nextProfile?.id ||
      nextState.role !== nextRole ||
      nextState.authStatus !== (nextUser ? "authenticated" : "unauthenticated") ||
      nextState.supportModeActive !== true
    ) {
      nextState.user = nextUser;
      nextState.profile = nextProfile;
      nextState.role = nextRole;
      nextState.authStatus = nextUser ? "authenticated" : "unauthenticated";
      nextState.supportModeActive = true;
      changed = true;
      if (authDiagEnabled) {
        console.warn("[auth] init", {
          supportModeActive: true,
          effectiveUserId: nextUser?.id ?? null,
          effectiveEmail: nextUser?.email ?? null,
        });
      }
    }
  } else if (nextState.supportModeActive) {
    nextState.supportModeActive = false;
    changed = true;
  }

  if (!supportModeActive && initialUser && !nextState.user) {
    nextState.user = initialUser;
    nextState.authStatus = "authenticated";
    changed = true;
  }

  if (!supportModeActive && initialProfile && !nextState.profile) {
    nextState.profile = initialProfile;
    changed = true;
  }

  if (!supportModeActive && initialRole && !nextState.role) {
    nextState.role = initialRole;
    changed = true;
  }

  if (changed) {
    nextState.role = resolveRole(nextState.profile, nextState.user, nextState.role);
    setAuthState(nextState);
  }
}

function syncAuthGuardState(guard) {
  const rateLimited = guard.cooldownMsRemaining > 0;
  const rateLimitUntil = guard.cooldownUntil || 0;
  const rateLimitMessage = rateLimited
    ? "We're having trouble connecting. Please wait a moment."
    : null;

  const next = { ...authStore.state };
  let changed = false;

  if (next.rateLimited !== rateLimited) {
    next.rateLimited = rateLimited;
    changed = true;
  }

  if (next.rateLimitUntil !== rateLimitUntil) {
    next.rateLimitUntil = rateLimitUntil;
    changed = true;
  }

  if (next.rateLimitMessage !== rateLimitMessage) {
    next.rateLimitMessage = rateLimitMessage;
    changed = true;
  }

  if (guard.tokenInvalidAt && next.tokenInvalidAt !== guard.tokenInvalidAt) {
    next.tokenInvalidAt = guard.tokenInvalidAt;
    changed = true;
  }

  if (typeof guard.refreshDisabledUntil === "number") {
    if (next.refreshDisabledUntil !== guard.refreshDisabledUntil) {
      next.refreshDisabledUntil = guard.refreshDisabledUntil;
      changed = true;
    }
  }

  if (next.refreshDisabledReason !== (guard.refreshDisabledReason || null)) {
    next.refreshDisabledReason = guard.refreshDisabledReason || null;
    changed = true;
  }

  if (changed) {
    setAuthState(next);
  }
}

function ensureAuthGuardSubscription() {
  if (authStore.guardSubscribed) return;
  authStore.guardSubscribed = true;
  syncAuthGuardState(getAuthGuardState());
  subscribeAuthGuard((guard) => {
    syncAuthGuardState(guard);
  });
}

async function fetchProfile(user) {
  if (!user?.id) {
    return { profile: null, error: null };
  }
  const now = Date.now();
  if (profileFetchBlockedUntil > now) {
    return {
      profile: null,
      error: {
        message: "Profile refresh temporarily paused due to repeated failures.",
        code: "profile_fetch_cooldown",
      },
    };
  }

  if (profileFetchInFlight && profileFetchInFlightUserId === user.id) {
    return profileFetchInFlight;
  }

  profileFetchInFlightUserId = user.id;
  profileFetchInFlight = (async () => {
    try {
      const res = await fetch("/api/me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status !== 401) {
          const nowFail = Date.now();
          profileFetchFailureTimestamps = profileFetchFailureTimestamps.filter(
            (ts) => nowFail - ts < PROFILE_RETRY_WINDOW_MS
          );
          profileFetchFailureTimestamps.push(nowFail);
          if (profileFetchFailureTimestamps.length >= PROFILE_MAX_FAILURES) {
            profileFetchBlockedUntil = nowFail + PROFILE_COOLDOWN_MS;
          }
        }
        return {
          profile: null,
          error: { message: payload?.error || "Failed to load profile" },
        };
      }
      profileFetchFailureTimestamps = [];
      profileFetchBlockedUntil = 0;
      return { profile: payload?.profile ?? null, error: null };
    } catch (err) {
      const nowFail = Date.now();
      profileFetchFailureTimestamps = profileFetchFailureTimestamps.filter(
        (ts) => nowFail - ts < PROFILE_RETRY_WINDOW_MS
      );
      profileFetchFailureTimestamps.push(nowFail);
      if (profileFetchFailureTimestamps.length >= PROFILE_MAX_FAILURES) {
        profileFetchBlockedUntil = nowFail + PROFILE_COOLDOWN_MS;
      }
      return { profile: null, error: err };
    } finally {
      profileFetchInFlight = null;
      profileFetchInFlightUserId = null;
    }
  })();
  return profileFetchInFlight;
}

async function getProfileForUser(user) {
  if (!user?.id) return { profile: null, error: null };
  if (authStore.profilePromise && authStore.profileUserId === user.id) {
    return authStore.profilePromise;
  }
  if (authStore.profileUserId === user.id && authStore.state.profile) {
    return { profile: authStore.state.profile, error: null };
  }

  authStore.profileUserId = user.id;
  authStore.profilePromise = fetchProfile(user)
    .finally(() => {
      authStore.profilePromise = null;
    });
  return authStore.profilePromise;
}

async function applyUserUpdate(user) {
  if (authStore.state.supportModeActive) {
    return;
  }
  const currentId = authStore.state.user?.id || null;
  const nextId = user?.id || null;
  const nextStatus = user ? "authenticated" : "unauthenticated";
  const statusChanged = authStore.state.authStatus !== nextStatus;
  const needsProfile =
    Boolean(user) &&
    (!authStore.state.profile || authStore.profileUserId !== nextId);

  if (currentId === nextId && !statusChanged && !needsProfile) {
    return;
  }

  if (!user) {
    applySignedOutState("apply_user_update", {
      resetGuardState: false,
      clearAuthSuppression: true,
    });
    return;
  }

  if (currentId !== nextId || statusChanged) {
    updateAuthState({
      ...withGuardState(buildSignedInState({ user })),
      profile: authStore.state.profile,
      role: resolveRole(authStore.state.profile, user, authStore.state.role),
    });
  }

  const { profile } = await getProfileForUser(user);
  if (authStore.state.user?.id !== user.id) return;
  updateAuthState({
    profile,
    role: resolveRole(profile, user, authStore.state.role),
  });
}

async function bootstrapAuth() {
  if (authStore.bootstrapPromise) return authStore.bootstrapPromise;

  const abortController = new AbortController();
  authStore.bootstrapAbortController = abortController;
  const { signal } = abortController;

  authStore.bootstrapPromise = (async () => {
    updateAuthState({ authStatus: "loading", error: null });
    let user = null;
    let sessionChecked = false;
    let sessionError = null;

    if (signal.aborted) {
      logAuthDiag("auth:bootstrap:aborted", { step: "start" });
      return;
    }

    if (authStore.supabase?.auth?.getSession) {
      sessionChecked = true;
      try {
        const { data, error } = await authStore.supabase.auth.getSession();
        if (error) {
          sessionError = error;
          setAuthError(error);
        }
        const session = data?.session ?? null;
        updateAuthState({ session });
        user = session?.user ?? null;
        logAuthDiag("auth:getSession:result", {
          ok: !error,
          hasUser: Boolean(user),
          sessionUserId: user?.id ?? null,
          error: error?.message ?? null,
        });
      } catch (err) {
        sessionError = err;
        setAuthError(err);
        updateAuthState({ session: null });
        logAuthDiag("auth:getSession:result", {
          ok: false,
          hasUser: false,
          sessionUserId: null,
          error: err?.message ?? String(err),
        });
      }
    }

    if (signal.aborted) {
      logAuthDiag("auth:bootstrap:aborted", { step: "session" });
      return;
    }

    if (sessionChecked) {
      if (!user || sessionError) {
        applySignedOutState("bootstrap:no_session", {
          resetGuardState: false,
          clearAuthSuppression: true,
        });
        return;
      }
    }

    if (signal.aborted) {
      logAuthDiag("auth:bootstrap:aborted", { step: "verified_user" });
      return;
    }

    if (!user) {
      applySignedOutState("bootstrap:no_user", {
        resetGuardState: false,
        clearAuthSuppression: true,
      });
      return;
    }
    await applyUserUpdate(user);
  })().finally(() => {
    if (authStore.bootstrapAbortController === abortController) {
      authStore.bootstrapAbortController = null;
    }
    authStore.bootstrapPromise = null;
  });

  return authStore.bootstrapPromise;
}

function ensureAuthListener() {
  if (authStore.authUnsubscribe) return;
  if (!authStore.supabase?.auth?.onAuthStateChange) return;

  const { data } = authStore.supabase.auth.onAuthStateChange(
    async (event, session) => {
      const user = session?.user ?? null;
      updateAuthState({ session });
      if (authDiagEnabled) {
        console.warn("[auth] state-change", {
          supportModeActive: authStore.state.supportModeActive === true,
          supabaseUserId: user?.id ?? null,
        });
      }
      logAuthDiag("auth:event", {
        event,
        hasUser: Boolean(user),
        sessionUserId: user?.id ?? null,
      });

      if (event === "SIGNED_OUT" || event === "USER_DELETED") {
        emitAuthUiReset("auth_event:signed_out");
        clearVerifiedUserCache();
        applySignedOutState("auth_event:signed_out", {
          resetGuardState: true,
          clearAuthSuppression: false,
          extraState: {
            lastAuthEvent: event,
            lastError: null,
          },
        });
        return;
      }

      updateAuthState({ lastAuthEvent: event });
      if (!user) {
        applySignedOutState("auth_event:no_user", {
          resetGuardState: false,
          clearAuthSuppression: true,
        });
        return;
      }
      authStore.loggingOut = false;
      if (authStore.state.supportModeActive) {
        return;
      }
      void applyUserUpdate(user);
    }
  );

  authStore.authUnsubscribe = () => {
    data?.subscription?.unsubscribe();
  };
}

function releaseAuthListener() {
  if (!authStore.authUnsubscribe) return;
  authStore.authUnsubscribe();
  authStore.authUnsubscribe = null;
}

function redirectWithGuard(target) {
  if (typeof window === "undefined") return;
  const current = new URL(window.location.href);
  const redirectUrl = new URL(target, window.location.origin);

  const nextPath = `${redirectUrl.pathname}${redirectUrl.search}`;
  if (`${current.pathname}${current.search}` === nextPath) {
    return;
  }

  window.location.replace(nextPath);
}

export function AuthProvider({
  children,
  initialUser = null,
  initialProfile = null,
  initialRole = null,
  initialSupportModeActive = false,
}) {
  const parentAuth = useContext(AuthContext);
  const [isNestedProvider] = useState(() => Boolean(parentAuth?.providerInstanceId));
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const authDiagEnabledLocal = useMemo(
    () =>
      process.env.NEXT_PUBLIC_AUTH_DIAG === "1" &&
      process.env.NODE_ENV !== "production",
    []
  );
  const rscLoopDiagEnabled = useMemo(
    () =>
      process.env.NEXT_PUBLIC_RSC_LOOP_DIAG === "1" &&
      process.env.NODE_ENV !== "production",
    []
  );
  const allowBootstrap = !pathname?.startsWith("/business-auth");
  const supabase = useMemo(
    () => (allowBootstrap ? getSupabaseBrowserClient() : null),
    [allowBootstrap]
  );
  const authState = useSyncExternalStore(
    subscribeAuthState,
    getAuthStateSnapshot,
    getAuthStateSnapshot
  );

  const mountedRef = useRef(true);
  const fetchWrappedRef = useRef(false);
  const reactId = useId();
  const providerInstanceId = useMemo(
    () => `auth-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [reactId]
  );
  const authUiFailsafeTimerRef = useRef(null);
  const authRouteRedirectRef = useRef({
    userId: null,
    target: null,
    fromPath: null,
  });
  const router = useRouter();
  const lastKnownRoleRef = useRef(null);
  const logRefreshAttempt = useCallback(
    (reason) => {
      if (!rscLoopDiagEnabled || typeof window === "undefined") return;
      console.warn("[RSC_LOOP_DIAG] router.refresh_attempt", {
        reason,
        pathname: window.location.pathname,
        ts: Date.now(),
        stack: new Error().stack,
      });
    },
    [rscLoopDiagEnabled]
  );
  const triggerAutoRefreshBlocked = useCallback(
    (reason, blockedUntil) => {
      updateAuthState({
        refreshDisabledReason: reason,
        refreshDisabledUntil: blockedUntil,
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(AUTO_REFRESH_BLOCKED_EVENT, {
            detail: { reason, blockedUntil, ts: Date.now() },
          })
        );
      }
      if (rscLoopDiagEnabled && typeof window !== "undefined") {
        console.warn("[RSC_LOOP_DIAG] auto_refresh_blocked", {
          reason,
          blockedUntil,
          pathname: window.location.pathname,
          stack: new Error().stack,
        });
      }
    },
    [rscLoopDiagEnabled]
  );
  const shouldAllowAutoRefresh = useCallback(
    (reason) => {
      const now = Date.now();
      const guardState = readRefreshGuardState();
      let attempts = guardState.attempts.filter(
        (ts) => now - ts < AUTO_REFRESH_WINDOW_MS
      );
      let blockedUntil = guardState.blockedUntil;
      let lastRefreshAt = guardState.lastRefreshAt;
      if (autoRefreshDisabled) {
        logAuthDiag("router:refresh:skipped", { reason, gate: "auto_refresh_disabled" });
        return false;
      }
      if (blockedUntil > now) {
        triggerAutoRefreshBlocked("rsc_loop_guard_cooldown", blockedUntil);
        return false;
      }
      if (now - lastRefreshAt < AUTO_REFRESH_MIN_INTERVAL_MS) {
        blockedUntil = now + AUTO_REFRESH_COOLDOWN_MS;
        writeRefreshGuardState({
          attempts: [],
          blockedUntil,
          lastRefreshAt,
        });
        triggerAutoRefreshBlocked("rsc_loop_guard_min_interval", blockedUntil);
        return false;
      }
      if (attempts.length >= AUTO_REFRESH_MAX_ATTEMPTS) {
        blockedUntil = now + AUTO_REFRESH_COOLDOWN_MS;
        writeRefreshGuardState({
          attempts: [],
          blockedUntil,
          lastRefreshAt,
        });
        triggerAutoRefreshBlocked("rsc_loop_guard_rate_limit", blockedUntil);
        return false;
      }
      attempts.push(now);
      lastRefreshAt = now;
      writeRefreshGuardState({
        attempts,
        blockedUntil: 0,
        lastRefreshAt,
      });
      if (authStore.state.refreshDisabledReason || authStore.state.refreshDisabledUntil) {
        updateAuthState({
          refreshDisabledReason: null,
          refreshDisabledUntil: 0,
        });
      }
      return true;
    },
    [triggerAutoRefreshBlocked]
  );
  const guardedRouterRefresh = useCallback(
    (reason) => {
      if (!shouldAllowAutoRefresh(reason)) return false;
      logRefreshAttempt(reason);
      router.refresh();
      return true;
    },
    [logRefreshAttempt, router, shouldAllowAutoRefresh]
  );

  useEffect(() => {
    if (authState.role) {
      lastKnownRoleRef.current = authState.role;
    }
  }, [authState.role]);

  useEffect(() => {
    if (isNestedProvider) return;
    if (isAuthNavigationSuppressed()) return;
    if (authState.lastAuthEvent !== "SIGNED_OUT") return;
    if (!pathname) return;
    if (!isProtectedPath(pathname)) return;
    const target = pathname.startsWith("/business")
      ? PATHS.auth.businessLogin
      : PATHS.auth.customerLogin;
    if (pathname === target || pathname === `${target}/`) return;
    logAuthDiag("route_guard:signed_out_redirect", { from: pathname, to: target });
    redirectWithGuard(target);
  }, [authState.lastAuthEvent, isNestedProvider, pathname]);

  useEffect(() => {
    mountedRef.current = true;
    authStore.providerCount += 1;
    authStore.providerInstanceId = providerInstanceId;
    if (authDiagEnabledLocal && authStore.providerCount > 1) {
      console.warn("[AUTH_DIAG] provider:multiple", {
        providerInstanceId,
        providerCount: authStore.providerCount,
        pathname: typeof window !== "undefined" ? window.location.pathname : null,
      });
    }

    if (supabase && !authStore.supabase) {
      authStore.supabase = supabase;
    }

    seedAuthState({
      initialUser,
      initialProfile,
      initialRole,
      supportModeActive: Boolean(initialSupportModeActive),
    });

    if (!isNestedProvider && allowBootstrap) {
      ensureAuthGuardSubscription();
      ensureAuthListener();

      if (!authStore.state.user && !authStore.state.supportModeActive) {
        void bootstrapAuth();
      }
    }

    return () => {
      mountedRef.current = false;
      authStore.providerCount = Math.max(0, authStore.providerCount - 1);
      if (authStore.providerCount === 0) {
        releaseAuthListener();
      }
    };
  }, [
    initialProfile,
    initialRole,
    initialSupportModeActive,
    initialUser,
    isNestedProvider,
    supabase,
    authDiagEnabledLocal,
    allowBootstrap,
    providerInstanceId,
  ]);

  useEffect(() => {
    if (!authDiagEnabledLocal) return undefined;
    authClickTracerRefs += 1;
    if (authClickTracerRefs === 1) {
      authClickTracerCleanup = attachAuthClickTracer();
    }
    return () => {
      authClickTracerRefs = Math.max(0, authClickTracerRefs - 1);
      if (authClickTracerRefs === 0 && authClickTracerCleanup) {
        authClickTracerCleanup();
        authClickTracerCleanup = null;
      }
    };
  }, [authDiagEnabledLocal]);

  useEffect(() => {
    if (isNestedProvider) return;
    if (!pathname) return;
    emitAuthUiReset("route_change");
  }, [isNestedProvider, pathname]);

  useEffect(() => {
    if (isNestedProvider) return;
    if (!pathname) return;
    if (!authStore.state.supportModeActive) return;
    if (pathname.startsWith("/customer")) return;
    updateAuthState({ supportModeActive: false });
    void bootstrapAuth();
  }, [isNestedProvider, pathname]);

  useEffect(() => {
    if (isNestedProvider) return;
    if (typeof window === "undefined") return;
    const signedOut = searchParams?.get("signedout") === "1";
    if (!signedOut) return;

    clearVerifiedUserCache();
    clearSupabaseAuthStorage();
    clearSupabaseCookiesClient();
    applySignedOutState("signedout_param", {
      resetGuardState: true,
      clearAuthSuppression: true,
    });
    resetSupabaseClient();

    const params = new URLSearchParams(searchParams.toString());
    params.delete("signedout");
    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState({}, "", next);
    if (process.env.NODE_ENV !== "production") {
      console.info("[AUTH_REDIRECT_TRACE] signedout_param_cleared", {
        pathname: window.location.pathname,
      });
    }
  }, [isNestedProvider, searchParams]);

  useEffect(() => {
    if (isNestedProvider) return;
    const now = Date.now();
    const state = readRefreshGuardState();
    if (state.blockedUntil > now) {
      updateAuthState({
        refreshDisabledReason: "rsc_loop_guard_cooldown",
        refreshDisabledUntil: state.blockedUntil,
      });
    }
  }, [isNestedProvider]);

  useEffect(() => {
    if (!rscLoopDiagEnabled || typeof window === "undefined") return undefined;
    const handleRetry = () => {
      writeRefreshGuardState({
        attempts: [],
        blockedUntil: 0,
        lastRefreshAt: 0,
      });
      updateAuthState({
        refreshDisabledReason: null,
        refreshDisabledUntil: 0,
      });
      guardedRouterRefresh("manual_retry");
    };
    window.addEventListener(AUTO_REFRESH_RETRY_EVENT, handleRetry);
    window.__YB_DIAG_TRIGGER_REFRESH = (reason = "manual_diag") => {
      guardedRouterRefresh(String(reason || "manual_diag"));
    };
    window.__YB_DIAG_SIMULATE_AUTH_EVENT = (event = "TOKEN_REFRESHED") => {
      updateAuthState({ lastAuthEvent: String(event) });
    };
    return () => {
      window.removeEventListener(AUTO_REFRESH_RETRY_EVENT, handleRetry);
      delete window.__YB_DIAG_TRIGGER_REFRESH;
      delete window.__YB_DIAG_SIMULATE_AUTH_EVENT;
    };
  }, [guardedRouterRefresh, rscLoopDiagEnabled]);

  useEffect(() => {
    if (isNestedProvider) return undefined;
    if (process.env.NODE_ENV === "production") return undefined;
    if (authState.authStatus !== "loading") return undefined;
    const timer = setTimeout(() => {
      if (authStore.state.authStatus === "loading") {
        console.warn(
          "[AUTH_DIAG] authStatus still loading after 2s",
          authStore.state
        );
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [authState.authStatus, isNestedProvider]);

  useEffect(() => {
    if (isNestedProvider) return;
    if (!authState.tokenInvalidAt) return;
    if (authState.tokenInvalidAt <= handledTokenInvalidAt) return;
    handledTokenInvalidAt = authState.tokenInvalidAt;

    (async () => {
      logAuthDiag("auth:token_invalid:handle", {
        tokenInvalidAt: authState.tokenInvalidAt,
      });
      clearSupabaseAuthStorage();
      if (authStore.supabase) {
        try {
          await authStore.supabase.auth.signOut({ scope: "local" });
        } catch {
          // best effort
        }
      }
      await cleanupRealtimeChannels();
      clearVerifiedUserCache();
      applySignedOutState("token_invalid", {
        resetGuardState: true,
        clearAuthSuppression: true,
      });
      acknowledgeAuthTokenInvalid(authState.tokenInvalidAt);

      const target =
        authStore.state.role === "business"
          ? PATHS.auth.businessLogin
          : PATHS.auth.customerLogin;
      redirectWithGuard(target);
    })();
  }, [authState.tokenInvalidAt, isNestedProvider]);

  const refreshProfile = useCallback(async () => {
    if (!mountedRef.current || !authStore.supabase || !authState.user?.id) {
      return;
    }
    const { profile, error } = await fetchProfile(authState.user);
    if (error || !mountedRef.current) return;
    updateAuthState({
      profile,
      role: resolveRole(profile, authState.user, authState.role),
    });
  }, [authState.role, authState.user]);

  const resetAuthUiStateCb = useCallback((reason) => {
    resetAuthUiState(reason);
  }, []);

  const seedAuthStateCb = useCallback((payload) => {
    seedAuthState(payload);
  }, []);

  const logout = useCallback(
    async (options = {}) => {
      if (isAuthNavigationSuppressed()) return;
      const { redirectTo, reason = "logout" } = options;
      const role = authStore.state.role;
      const inferredRole =
        role ||
        (typeof window !== "undefined" &&
        window.location.pathname.startsWith("/business")
          ? "business"
          : "customer");
      const publicRedirect = resolveLogoutRedirect({
        role: inferredRole,
        redirectTo,
      });

      resetAuthUiState("logout:pre");
      emitAuthUiReset("logout:pre");
      authStore.loggingOut = true;
      authStore.logoutRedirectInFlight = true;
      applySignedOutState("logout:pre", {
        resetGuardState: true,
        resetAuthUi: false,
        extraState: {
          lastAuthEvent: "SIGNED_OUT",
          lastError: null,
        },
      });

      logAuthDiag("logout", {
        hasUser: Boolean(authStore.state.user),
        authStatus: authStore.state.authStatus,
        authBusy: authStore.state.authBusy,
        reason,
        role,
        redirectTo: publicRedirect,
      });

      clearVerifiedUserCache();
      clearSupabaseAuthStorage();
      clearSupabaseCookiesClient();
      await performLogout({
        supabase: authStore.supabase,
        role: inferredRole,
        redirectTo: publicRedirect,
        callServerSignout: typeof window !== "undefined",
      });
    },
    []
  );

  const value = useMemo(
    () => ({
      supabase: authStore.supabase ?? supabase,
      authStatus: authState.authStatus,
      session: authState.session,
      status:
        authState.authStatus === "authenticated"
          ? "signed_in"
          : authState.authStatus === "unauthenticated"
            ? "signed_out"
            : "loading",
      user: authState.user,
      profile: authState.profile,
      role: authState.role,
      supportModeActive: authState.supportModeActive === true,
      error: authState.error,
      lastAuthEvent: authState.lastAuthEvent,
      lastError: authState.lastError,
      loadingUser:
        authState.authStatus === "loading",
      rateLimited: authState.rateLimited,
      rateLimitUntil: authState.rateLimitUntil,
      rateLimitMessage: authState.rateLimitMessage,
      refreshDisabledUntil: authState.refreshDisabledUntil,
      refreshDisabledReason: authState.refreshDisabledReason,
      authBusy: authState.authBusy,
      authAction: authState.authAction,
      authAttemptId: authState.authAttemptId,
      authActionStartedAt: authState.authActionStartedAt,
      providerInstanceId,
      refreshProfile,
      logout,
      beginAuthAttempt,
      endAuthAttempt,
      resetAuthUiState: resetAuthUiStateCb,
      seedAuthState: seedAuthStateCb,
    }),
    [
      authState.authStatus,
      authState.session,
      authState.error,
      authState.profile,
      authState.rateLimitMessage,
      authState.rateLimitUntil,
      authState.rateLimited,
      authState.refreshDisabledReason,
      authState.refreshDisabledUntil,
      authState.role,
      authState.supportModeActive,
      authState.user,
      authState.lastAuthEvent,
      authState.lastError,
      authState.authBusy,
      authState.authAction,
      authState.authAttemptId,
      authState.authActionStartedAt,
      supabase,
      logout,
      refreshProfile,
      resetAuthUiStateCb,
      seedAuthStateCb,
      providerInstanceId,
    ]
  );

  useEffect(() => {
    if (isNestedProvider) return;
    if (!authDiagEnabledLocal) return;
    console.log("[AUTH_DIAG] status", {
      providerInstanceId,
      authStatus: authState.authStatus,
      status:
        authState.authStatus === "authenticated"
          ? "signed_in"
          : authState.authStatus === "unauthenticated"
            ? "signed_out"
            : "loading",
      hasUser: Boolean(authState.user),
      hasProfile: Boolean(authState.profile),
      lastAuthEvent: authState.lastAuthEvent,
      lastError: authState.lastError,
      authBusy: authState.authBusy,
      authAction: authState.authAction,
      authAttemptId: authState.authAttemptId,
      authActionStartedAt: authState.authActionStartedAt,
    });
  }, [
    authState.authStatus,
    authState.authAction,
    authState.authAttemptId,
    authState.authBusy,
    authState.authActionStartedAt,
    authState.lastAuthEvent,
    authState.lastError,
    authState.profile,
    authState.user,
    authDiagEnabledLocal,
    isNestedProvider,
    providerInstanceId,
  ]);

  useEffect(() => {
    if (isNestedProvider) return;
    if (!authDiagEnabledLocal || fetchWrappedRef.current) return;
    if (typeof window === "undefined" || typeof window.fetch !== "function") return;
    fetchWrappedRef.current = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const input = args[0];
      const init = args[1] || {};
      const url = typeof input === "string" ? input : input?.url || "";
      const requestHeaders =
        input instanceof Request
          ? input.headers
          : new Headers(init?.headers || {});
      const hasRscHeader = requestHeaders.has("RSC") || requestHeaders.has("rsc");
      const isRedirectParam = url.includes("redirected=1");
      const response = await originalFetch(...args);

      if (
        (hasRscHeader || isRedirectParam) &&
        (response.redirected || response.status >= 300)
      ) {
        console.warn("[AUTH_DIAG] fetch:rsc", {
          url,
          status: response.status,
          redirected: response.redirected,
          location: response.headers.get("location"),
          authStatus: authStore.state.authStatus,
          stack: new Error().stack,
        });
      }

      if (response.status === 401 || response.status === 403) {
        console.warn("[AUTH_DIAG] fetch:unauthorized", {
          url,
          status: response.status,
          authStatus: authStore.state.authStatus,
          stack: new Error().stack,
        });
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
      fetchWrappedRef.current = false;
    };
  }, [authDiagEnabledLocal, isNestedProvider]);

  useEffect(() => {
    if (isNestedProvider) return;
    if (authState.authStatus !== "unauthenticated" || authState.user) return;
    if (authStore.logoutRedirectInFlight) return;
    if (authStore.loggingOut) {
      authStore.loggingOut = false;
    }
  }, [authState.authStatus, authState.user, isNestedProvider]);

  useEffect(() => {
    if (isNestedProvider) return;
    if (typeof window === "undefined") return;
    if (isAuthNavigationSuppressed()) return;
    if (authState.authStatus !== "unauthenticated" || authState.user) return;
    if (!pathname) return;
    if (!isProtectedPath(pathname)) return;
    if (pathname.startsWith("/business-auth")) return;

    const target = pathname.startsWith("/business/")
      ? PATHS.auth.businessLogin
      : pathname.startsWith("/business")
        ? PATHS.public.businessLanding
        : PATHS.auth.customerLogin;
    if (pathname === target || pathname === `${target}/`) return;

    logAuthDiag("route_guard:client_redirect", {
      from: pathname,
      to: target,
      role: lastKnownRoleRef.current,
    });
    if (process.env.NODE_ENV !== "production") {
      console.info("[AUTH_REDIRECT_TRACE] unauthenticated_redirect", {
        pathname,
        role: lastKnownRoleRef.current ?? null,
        hasSession: Boolean(authState.session),
        hasUser: Boolean(authState.user),
        destination: target,
      });
    }
    redirectWithGuard(target);
  }, [authState.authStatus, authState.session, authState.user, isNestedProvider, pathname]);

  useEffect(() => {
    if (isNestedProvider) return;
    if (typeof window === "undefined") return;
    if (isAuthNavigationSuppressed()) return;
    if (authState.authStatus !== "authenticated" || !authState.user) return;
    if (!pathname) return;
    if (!pathname.startsWith("/business-auth")) return;
    const resolvedRole = authState.profile?.role ?? authState.role;
    if (!resolvedRole) {
      if (process.env.NODE_ENV !== "production") {
        console.info("[AUTH_REDIRECT_TRACE] auth_redirect_waiting_for_role", {
          pathname,
          hasSession: Boolean(authState.session),
          hasUser: Boolean(authState.user),
          role: null,
        });
      }
      return;
    }

    const requestedPath =
      searchParams?.get("next") ||
      searchParams?.get("returnUrl") ||
      searchParams?.get("callbackUrl") ||
      null;
    const target = getPostLoginRedirect({
      role: resolvedRole,
      requestedPath,
      fallbackPath:
        resolvedRole === "business" ? PATHS.business.dashboard : PATHS.customer.home,
    });
    const redirectState = authRouteRedirectRef.current;
    const sameRedirect =
      redirectState.userId === authState.user.id &&
      redirectState.target === target &&
      redirectState.fromPath === pathname;
    if (sameRedirect) return;
    if (pathname === target || pathname === `${target}/`) return;

    logAuthDiag("route_guard:auth_redirect", {
      from: pathname,
      to: target,
      role: authState.role,
    });
    if (process.env.NODE_ENV !== "production") {
      console.info("[AUTH_REDIRECT_TRACE] auth_provider_redirect_effect", {
        role: authState.profile?.role ?? authState.role ?? null,
        requestedPath,
        chosenDestination: target,
        persistedRedirectState: readClientRedirectState(),
        hasSession: Boolean(authState.session),
      });
    }
    authRouteRedirectRef.current = {
      userId: authState.user.id,
      target,
      fromPath: pathname,
    };
    router.replace(target);
  }, [
    authState.authStatus,
    authState.profile?.is_internal,
    authState.profile?.role,
    authState.role,
    authState.session,
    authState.user,
    isNestedProvider,
    pathname,
    searchParams,
    router,
  ]);

  useEffect(() => {
    if (isNestedProvider) return;
    if (authState.authStatus !== "unauthenticated" || authState.user) {
      if (authUiFailsafeTimerRef.current) {
        clearTimeout(authUiFailsafeTimerRef.current);
        authUiFailsafeTimerRef.current = null;
      }
      return;
    }
    if (!authState.authBusy && !authState.authAction) {
      if (authUiFailsafeTimerRef.current) {
        clearTimeout(authUiFailsafeTimerRef.current);
        authUiFailsafeTimerRef.current = null;
      }
      return;
    }

    const startedAt = authState.authActionStartedAt || 0;
    const ageMs = startedAt ? Date.now() - startedAt : 0;
    const remainingMs = startedAt ? Math.max(0, 5000 - ageMs) : 0;

    if (remainingMs === 0) {
      logAuthDiag("auth_ui:failsafe", {
        ageMs,
        authAction: authState.authAction,
        authAttemptId: authState.authAttemptId,
      });
      updateAuthState({
        authBusy: false,
        authAction: null,
        authActionStartedAt: 0,
      });
      return;
    }

    if (authUiFailsafeTimerRef.current) {
      clearTimeout(authUiFailsafeTimerRef.current);
    }
    authUiFailsafeTimerRef.current = setTimeout(() => {
      authUiFailsafeTimerRef.current = null;
      if (authStore.state.authStatus !== "unauthenticated") return;
      if (authStore.state.user) return;
      logAuthDiag("auth_ui:failsafe", {
        ageMs: Date.now() - startedAt,
        authAction: authStore.state.authAction,
        authAttemptId: authStore.state.authAttemptId,
      });
      updateAuthState({
        authBusy: false,
        authAction: null,
        authActionStartedAt: 0,
      });
    }, remainingMs);
  }, [
    authState.authAction,
    authState.authBusy,
    authState.authActionStartedAt,
    authState.authStatus,
    authState.user,
    authState.authAttemptId,
    isNestedProvider,
  ]);

  return (
    isNestedProvider ? (
      <>{children}</>
    ) : (
      <AuthContext.Provider value={value}>
        {children}
        {authDiagEnabledLocal ? (
          <AuthStateDebug />
        ) : null}
      </AuthContext.Provider>
    )
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
