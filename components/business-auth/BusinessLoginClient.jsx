"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import { getSupabaseAuthCookieName } from "@/lib/supabase/cookieName";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { withTimeout } from "@/lib/withTimeout";
import { signOutLocalSession } from "@/lib/auth/logout";

function BusinessLoginInner({ isPopup }) {
  const authDiagEnabled = process.env.NEXT_PUBLIC_AUTH_DIAG === "1";
  const debugAuth = process.env.NEXT_PUBLIC_DEBUG_AUTH === "1";
  const authTimeoutMs = 30000;
  const profileTimeoutMs = 15000;
  const refreshTimeoutMs = 15000;
  const overallTimeoutMs = 45000;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const redirectingRef = useRef(false);
  const mountedRef = useRef(false);
  const pendingRef = useRef(false);
  const attemptRef = useRef(0);
  const didCompleteRef = useRef(false);
  const timeoutIdRef = useRef(null);
  const timeoutControllerRef = useRef(null);
  const flowIdRef = useRef(
    `auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const sessionRef = useRef(null);
  const supabaseRef = useRef(null);

  const getSupabase = useCallback(async () => {
    if (!supabaseRef.current) {
      const { getSupabaseBrowserClient } = await import("@/lib/supabase/browser");
      supabaseRef.current = getSupabaseBrowserClient();
    }
    return supabaseRef.current;
  }, []);

  const authDiagLog = useCallback(
    (event, payload = {}) => {
      if (!authDiagEnabled || typeof window === "undefined") return;
      const timestamp = new Date().toISOString();
      console.log("[AUTH_DIAG]", {
        timestamp,
        pathname: window.location.pathname,
        search: window.location.search,
        flowId: flowIdRef.current,
        event,
        ...payload,
      });
    },
    [authDiagEnabled]
  );

  const logAuthRequest = useCallback(
    (payload) => {
      if (!authDiagEnabled && !debugAuth) return;
      console.log("[AUTH_DEBUG]", payload);
    },
    [authDiagEnabled, debugAuth]
  );

  const isTimeoutError = useCallback((err) => {
    const name = err?.name || "";
    const message = String(err?.message || "").toLowerCase();
    return (
      name === "TimeoutError" ||
      name === "AbortError" ||
      message.includes("timed out")
    );
  }, []);

  const closeAuthAttempt = useCallback(
    (attemptId, reason) => {
      authDiagLog("auth:attempt:end", {
        action: "business_login",
        attemptId,
        reason,
      });
    },
    [authDiagLog]
  );

  const getCookieStatus = useCallback(() => {
    if (typeof document === "undefined") return null;
    const cookieName = getSupabaseAuthCookieName();
    const cookieLength = document.cookie.length;
    const names = document.cookie
      .split(";")
      .map((entry) => entry.trim().split("=")[0])
      .filter(Boolean);
    const hasAuthCookie = cookieName
      ? names.some(
          (name) => name === cookieName || name.startsWith(`${cookieName}.`)
        )
      : false;
    return {
      cookieName,
      cookieLength,
      hasAuthCookie,
    };
  }, []);

  const waitForAuthCookie = useCallback(async (timeoutMs = 2500) => {
    if (typeof document === "undefined") return false;
    const cookieName = getSupabaseAuthCookieName();
    if (!cookieName) return false;

    const hasAuthCookie = () => {
      const names = document.cookie
        .split(";")
        .map((entry) => entry.trim().split("=")[0])
        .filter(Boolean);
      return names.some(
        (name) => name === cookieName || name.startsWith(`${cookieName}.`)
      );
    };

    if (hasAuthCookie()) return true;

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (hasAuthCookie()) return true;
    }

    return false;
  }, []);

  const finishBusinessAuth = useCallback(
    (target = "/go/dashboard") => {
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      authDiagLog("redirect:start", { target, isPopup });

      if (typeof window !== "undefined") {
        try {
          // Broadcast success so other tabs (the opener) can react
          localStorage.setItem("business_auth_redirect", target);
          localStorage.setItem("business_auth_success", Date.now().toString());

          if (typeof BroadcastChannel !== "undefined") {
            const channel = new BroadcastChannel("yb-business-auth");
            channel.postMessage({ type: "YB_BUSINESS_AUTH_SUCCESS", target });
            channel.close();
          }
        } catch (err) {
          console.warn("Could not broadcast business auth success", err);
        }

        if (isPopup) {
          // Close popup when possible; fall back to in-tab redirect if blocked
          if (window.opener && window.location.origin) {
            try {
              authDiagLog("popup:postMessage", { target });
              window.opener.postMessage(
                { type: "YB_BUSINESS_AUTH_SUCCESS", target },
                window.location.origin
              );
            } catch (err) {
              console.warn("Popup postMessage failed", err);
            }
          }
          setTimeout(() => {
            window.close();

            // Some browsers ignore close() if not opened by script
            setTimeout(() => {
              if (!window.closed) {
                authDiagLog("popup:close:blocked", { target });
                authDiagLog("redirect:assign", { target });
                window.location.replace(target);
              }
            }, 250);
          }, 250);

          return;
        }
      }

      authDiagLog("redirect:assign", { target });
      window.location.replace(target);
    },
    [authDiagLog, isPopup]
  );

  const redirectToDashboard = useCallback(async () => {
    if (redirectingRef.current) return;
    await waitForAuthCookie();
    finishBusinessAuth();
  }, [finishBusinessAuth, waitForAuthCookie]);

  const handleLoginTimeout = useCallback(
    async (attemptId, timeoutController) => {
      if (didCompleteRef.current || attemptRef.current !== attemptId) return;
      timeoutController.abort(new Error("timeout"));
      pendingRef.current = false;

      let activeSession = sessionRef.current;
      try {
        const client = supabaseRef.current ?? (await getSupabase());
        const { data } = await client.auth.getSession();
        if (data?.session) {
          activeSession = data.session;
          sessionRef.current = data.session;
        }
      } catch (err) {
        console.warn("Could not read session after timeout", err);
      }

      authDiagLog("login:timeout", {
        attemptId,
        hasSession: Boolean(activeSession),
      });

      if (activeSession) {
        didCompleteRef.current = true;
        if (mountedRef.current) {
          setLoading(false);
        }
        closeAuthAttempt(attemptId, "session");
        await redirectToDashboard();
        return;
      }

      if (mountedRef.current) {
        setLoading(false);
        setAuthError(
          `Login request timed out after ${Math.round(overallTimeoutMs / 1000)}s. Please check your connection and try again.`
        );
      }
      closeAuthAttempt(attemptId, "timeout");
    },
    [authDiagLog, closeAuthAttempt, overallTimeoutMs, redirectToDashboard, getSupabase]
  );

  async function handleLogin(e) {
    e.preventDefault();
    if (pendingRef.current || loading) return;
    let supabase = null;
    try {
      supabase = await getSupabase();
    } catch {
      setAuthError("Auth client not ready. Please refresh and try again.");
      return;
    }
    const attemptId = attemptRef.current + 1;
    attemptRef.current = attemptId;
    authDiagLog("auth:attempt:begin", {
      action: "business_login",
      attemptId,
    });
    didCompleteRef.current = false;
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
    }
    if (timeoutControllerRef.current) {
      timeoutControllerRef.current.abort();
    }

    const timeoutController = new AbortController();
    timeoutControllerRef.current = timeoutController;
    timeoutIdRef.current = setTimeout(() => {
      void handleLoginTimeout(attemptId, timeoutController);
    }, overallTimeoutMs);

    pendingRef.current = true;
    if (mountedRef.current) {
      setLoading(true);
      setAuthError("");
    }
    authDiagLog("login:submit:start", { attemptId, isPopup });

    try {
      try {
        localStorage.setItem("signup_role", "business");
      } catch (err) {
        console.warn("Could not set signup role", err);
      }

      const signInStart = typeof performance !== "undefined" ? performance.now() : Date.now();
      const signInResult = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        authTimeoutMs,
        `Login request timed out after ${Math.round(authTimeoutMs / 1000)}s`
      );
      const signInDurationMs = Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) -
          signInStart
      );
      logAuthRequest({
        label: "supabase.signInWithPassword",
        url: supabaseUrl ? `${supabaseUrl}/auth/v1/token` : null,
        method: "POST",
        timeoutMs: authTimeoutMs,
        durationMs: signInDurationMs,
        status: signInResult?.error?.status ?? null,
        error: signInResult?.error?.message ?? null,
      });
      const { data, error } = signInResult;
      authDiagLog("login:signIn:result", {
        attemptId,
        hasSession: Boolean(data?.session),
        error: error?.message ?? null,
      });

      if (timeoutController.signal.aborted || attemptRef.current !== attemptId) {
        return;
      }

      if (error) {
        throw error;
      }

      const user = data.user;
      sessionRef.current = data?.session ?? null;

      const profileQuery = supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      const profileStart = typeof performance !== "undefined" ? performance.now() : Date.now();
      const profileResult = await withTimeout(
        typeof profileQuery.abortSignal === "function"
          ? profileQuery.abortSignal(timeoutController.signal)
          : profileQuery,
        profileTimeoutMs,
        `Profile request timed out after ${Math.round(profileTimeoutMs / 1000)}s`
      );
      const profileDurationMs = Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) -
          profileStart
      );
      logAuthRequest({
        label: "supabase.profile.role",
        url: supabaseUrl ? `${supabaseUrl}/rest/v1/users` : null,
        method: "GET",
        timeoutMs: profileTimeoutMs,
        durationMs: profileDurationMs,
        status: profileResult?.error?.status ?? null,
        error: profileResult?.error?.message ?? null,
      });
      const { data: profile, error: profileErr } = profileResult;

      if (timeoutController.signal.aborted || attemptRef.current !== attemptId) {
        return;
      }

      if (profileErr) {
        throw profileErr;
      }

      if (profile?.role !== "business") {
        await signOutLocalSession(supabase, "local");
        throw new Error("Only business accounts can log in here.");
      }

      const session = sessionRef.current;
      if (session?.access_token && session?.refresh_token) {
        const refreshStart = typeof performance !== "undefined" ? performance.now() : Date.now();
        const response = await fetchWithTimeout("/api/auth/refresh", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            }),
            timeoutMs: refreshTimeoutMs,
            signal: timeoutController.signal,
          });
        const refreshDurationMs = Math.round(
          (typeof performance !== "undefined" ? performance.now() : Date.now()) -
            refreshStart
        );
        logAuthRequest({
          label: "next.auth.refresh",
          url: "/api/auth/refresh",
          method: "POST",
          timeoutMs: refreshTimeoutMs,
          durationMs: refreshDurationMs,
          status: response?.status ?? null,
          error: response?.ok ? null : `HTTP ${response.status}`,
        });

        if (timeoutController.signal.aborted || attemptRef.current !== attemptId) {
          return;
        }

        if (!response.ok) {
          throw new Error("Session refresh failed. Please try again.");
        }
      }

      didCompleteRef.current = true;
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }
      await redirectToDashboard();
      authDiagLog("login:submit:success", { attemptId });
    } catch (err) {
      if (
        timeoutController.signal.aborted ||
        attemptRef.current !== attemptId
      ) {
        authDiagLog("login:submit:aborted", { attemptId });
        return;
      }
      if (!didCompleteRef.current && attemptRef.current === attemptId) {
        console.error("Business login failed", err);
        const message = isTimeoutError(err)
          ? "Login request timed out. Please check your connection and try again."
          : err?.message ?? "Login failed. Please refresh and try again.";
        authDiagLog("login:submit:error", { attemptId, message });
        alert(message);
        if (mountedRef.current) {
          setAuthError(message);
        }
      }
    } finally {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }
      if (attemptRef.current === attemptId) {
        pendingRef.current = false;
        if (mountedRef.current) {
          setLoading(false);
        }
      }
      closeAuthAttempt(attemptId, "password");
      authDiagLog("login:submit:end", { attemptId });
    }
  }

  async function handleGoogleLogin() {
    if (pendingRef.current || loading) return;
    let supabase = null;
    try {
      supabase = await getSupabase();
    } catch {
      setAuthError("Auth client not ready. Please refresh and try again.");
      return;
    }
    let attemptId = 0;
    try {
      attemptId = attemptRef.current + 1;
      attemptRef.current = attemptId;
      authDiagLog("auth:attempt:begin", {
        action: "business_oauth",
        attemptId,
      });
      pendingRef.current = true;
      if (mountedRef.current) {
        setLoading(true);
        setAuthError("");
      }

      const origin =
        typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
      const redirectTo = `${origin}/api/auth/callback`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      if (error) {
        console.error("Google login error:", error);
        alert("Failed to sign in with Google.");
        if (mountedRef.current) {
          setAuthError("Failed to sign in with Google.");
          setLoading(false);
        }
        pendingRef.current = false;
        return;
      }
    } finally {
      if (attemptId) {
        authDiagLog("auth:attempt:end", {
          action: "business_oauth",
          attemptId,
        });
      }
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }
      if (timeoutControllerRef.current) {
        timeoutControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (!authDiagEnabled) return;

    try {
      sessionStorage.setItem("auth_flow_id", flowIdRef.current);
    } catch (err) {
      console.warn("Could not persist auth flow id", err);
    }

    authDiagLog("login:mount", { popup: isPopup });
    const cookieStatus = getCookieStatus();
    authDiagLog("login:cookies", cookieStatus ?? {});

    const handleError = (event) => {
      authDiagLog("login:window:error", {
        message: event?.message ?? null,
        filename: event?.filename ?? null,
        lineno: event?.lineno ?? null,
        colno: event?.colno ?? null,
      });
    };

    const handleRejection = (event) => {
      const reason = event?.reason;
      authDiagLog("login:window:unhandledrejection", {
        reason: reason?.message ?? String(reason ?? ""),
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, [authDiagEnabled, authDiagLog, getCookieStatus, isPopup]);

  return (
    <div
      className="max-w-md w-full p-8 rounded-2xl border border-[var(--yb-border)] bg-white animate-fadeIn"
    >
        <h1 className="text-3xl font-extrabold text-center mb-3 tracking-tight text-slate-900">
          Business Login
        </h1>

          <p className="text-center mb-6 text-slate-600">
            Sign in to manage your business
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            {authError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {authError}
              </div>
            ) : null}
            <div className="space-y-2">
              <label
                htmlFor="business-login-email"
                className="text-sm font-medium text-slate-900"
              >
                Email
              </label>
              <input
                id="business-login-email"
                name="email"
                type="email"
                placeholder="you@company.com"
                className="w-full px-4 py-3 rounded-xl border border-[var(--yb-border)] bg-white text-slate-900 placeholder:text-slate-500 transition focus:outline-none focus:ring-2 focus:ring-[var(--yb-focus)] focus:border-[var(--yb-focus)]"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="business-login-password"
                className="text-sm font-medium text-slate-900"
              >
                Password
              </label>
              <input
                id="business-login-password"
                name="password"
                type="password"
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-[var(--yb-border)] bg-white text-slate-900 placeholder:text-slate-500 transition focus:outline-none focus:ring-2 focus:ring-[var(--yb-focus)] focus:border-[var(--yb-focus)]"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <div className="mt-2 text-right">
                <Link
                  href="/auth/forgot-password"
                  className="text-sm font-medium text-[var(--color-primary)] hover:underline"
                >
                  Forgot your password?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-lg bg-[#6E34FF] text-white transition hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Log in"}
            </button>
          </form>

          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full mt-5 py-3 rounded-xl font-medium flex items-center justify-center gap-2 border border-[var(--yb-border)] bg-white text-slate-900 transition hover:bg-slate-50"
          >
            <img src="/google-icon.svg" className="h-5 w-5" alt="Google" />
            Continue with Google
          </button>

          <p className="text-center text-sm mt-4 text-slate-600">
            Don&apos;t have an account?{" "}
            <a
              href="/business-auth/register"
              className="font-medium text-[var(--color-primary)] hover:underline"
            >
              Sign up
            </a>
          </p>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.6s ease-out;
        }
      `}</style>
    </div>
  );
}

export default function BusinessLoginClient({ isPopup = false }) {
  return <BusinessLoginInner isPopup={isPopup} />;
}
