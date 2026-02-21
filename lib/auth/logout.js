"use client";

import { stopRealtime } from "@/lib/realtimeManager";

let logoutPromise = null;
let logoutRedirectInFlight = false;
const logoutPerfEnabled = process.env.NODE_ENV !== "production";

function logoutNow() {
  if (typeof performance === "undefined") return Date.now();
  return performance.now();
}

function logoutPerf(step, payload) {
  if (!logoutPerfEnabled) return;
  const suffix = payload ? ` ${JSON.stringify(payload)}` : "";
  console.info(`[ADMIN_LOGOUT_PERF] ${step}${suffix}`);
}

function isProtectedPath(pathname) {
  if (!pathname) return false;
  if (pathname.startsWith("/customer")) return true;
  if (pathname.startsWith("/account")) return true;
  if (pathname.startsWith("/checkout")) return true;
  if (pathname.startsWith("/orders")) return true;
  if (pathname.startsWith("/business/")) return true;
  return false;
}

function withLoggedOutParam(pathname) {
  const url = new URL(pathname || "/", "http://localhost");
  if (!url.searchParams.has("loggedOut")) {
    url.searchParams.set("loggedOut", "1");
  }
  return `${url.pathname}${url.search}`;
}

export function resolveLogoutRedirect({ role, redirectTo } = {}) {
  const fallback = role === "business" ? "/business?loggedOut=1" : "/?loggedOut=1";
  if (!redirectTo || typeof redirectTo !== "string") return fallback;

  let parsed;
  try {
    parsed = new URL(redirectTo, "http://localhost");
  } catch {
    return fallback;
  }

  const candidate = `${parsed.pathname}${parsed.search}`;
  if (isProtectedPath(parsed.pathname)) return fallback;
  return withLoggedOutParam(candidate);
}

export async function cleanupSupabaseRealtime(supabase) {
  await stopRealtime(supabase);
}

export async function signOutLocalSession(supabase, scope = "local") {
  if (!supabase?.auth?.signOut) return;
  await cleanupSupabaseRealtime(supabase);
  try {
    await supabase.auth.signOut({ scope });
  } catch {
    // best effort
  }
}

export function isLogoutRedirectInFlight() {
  return logoutRedirectInFlight;
}

export function isLogoutInFlight() {
  return Boolean(logoutPromise) || logoutRedirectInFlight;
}

export async function performLogout({
  supabase,
  role,
  redirectTo,
  callServerSignout = true,
} = {}) {
  if (logoutPromise) return logoutPromise;

  const target = resolveLogoutRedirect({ role, redirectTo });
  logoutPromise = (async () => {
    const signOutStart = logoutNow();
    logoutPerf("signout_local_start");
    await signOutLocalSession(supabase, "local");
    logoutPerf("signout_local_end", {
      elapsedMs: Number((logoutNow() - signOutStart).toFixed(2)),
    });
    if (callServerSignout && typeof window !== "undefined") {
      const serverSignOutStart = logoutNow();
      logoutPerf("server_signout_start");
      try {
        await fetch("/api/auth/signout", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        // best effort
      }
      logoutPerf("server_signout_end", {
        elapsedMs: Number((logoutNow() - serverSignOutStart).toFixed(2)),
      });
    }
    if (typeof window !== "undefined") {
      logoutRedirectInFlight = true;
      logoutPerf("window_location_assign", { target });
      window.location.assign(target);
    }
    return target;
  })().finally(() => {
    logoutPromise = null;
  });

  return logoutPromise;
}
