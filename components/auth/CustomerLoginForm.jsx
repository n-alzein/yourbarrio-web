"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useModal } from "@/components/modals/ModalProvider";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { withTimeout } from "@/lib/withTimeout";
import { getPostLoginRedirect } from "@/lib/auth/redirects";
import {
  clearAuthIntent,
  consumeAuthIntent,
  sanitizeAuthRedirectPath,
} from "@/lib/auth/authIntent";
import { isBlockedAccountStatus, normalizeAccountStatus } from "@/lib/accountDeletion/status";
import {
  GENERIC_INVALID_CREDENTIALS_MESSAGE,
  isGenericInvalidCredentialsError,
  suppressAuthUiResetForCredentialsError,
} from "@/lib/auth/loginErrors";
import {
  getRequestedPathFromCurrentUrl,
  readClientRedirectState,
} from "@/lib/auth/clientRedirectState";
import { buildOAuthCallbackUrl, logOAuthStart } from "@/lib/auth/oauthRedirect";

export default function CustomerLoginForm({
  next: nextOverride = null,
  onSuccess = null,
  onSwitchToSignup = null,
}) {
  const {
    supabase,
    loadingUser,
    beginAuthAttempt,
    endAuthAttempt,
    authAttemptId,
  } = useAuth();
  const modal = useModal();
  const searchParams = useSearchParams();
  const authDiagEnabled = process.env.NEXT_PUBLIC_AUTH_DIAG === "1";
  const debugAuth = process.env.NEXT_PUBLIC_DEBUG_AUTH === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const attemptIdRef = useRef(0);
  const refreshControllerRef = useRef(null);
  const authTimeoutMs = 30000;
  const profileTimeoutMs = 15000;
  const refreshTimeoutMs = 15000;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");

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

  const getNextParam = useCallback(() => {
    const rawNext =
      typeof nextOverride === "string" && nextOverride.trim()
        ? nextOverride.trim()
        : searchParams?.get("next") ||
            searchParams?.get("returnUrl") ||
            searchParams?.get("callbackUrl") ||
            getRequestedPathFromCurrentUrl();
    if (!rawNext) return null;
    return sanitizeAuthRedirectPath(rawNext, null);
  }, [nextOverride, searchParams]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.info("[auth-next] form received next:", getNextParam() || null);
    }
  }, [getNextParam]);

  useEffect(() => {
    if ((searchParams?.get("auth") || "").trim() !== "invalid_credentials") return;
    setError(GENERIC_INVALID_CREDENTIALS_MESSAGE);
  }, [searchParams]);

  useEffect(() => {
    if (!attemptIdRef.current) return;
    if (authAttemptId === attemptIdRef.current) return;
    attemptIdRef.current = 0;
    setLoading(false);
  }, [authAttemptId]);

  useEffect(() => {
    return () => {
      if (refreshControllerRef.current) {
        refreshControllerRef.current.abort();
        refreshControllerRef.current = null;
      }
    };
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    if (loading || loadingUser) return;
    setError("");
    const client = supabase ?? getSupabaseBrowserClient();

    if (authDiagEnabled) {
      console.log("[AUTH_DIAG] customer login submit", {
        route: typeof window !== "undefined" ? window.location.pathname : null,
        hasSupabaseAuth: Boolean(supabase?.auth),
        hasClientAuth: Boolean(client?.auth),
        hasModalContext: typeof modal?.openModal === "function",
      });
    }

    if (!client || !client.auth) {
      setError("Auth is unavailable. Please refresh and try again.");
      return;
    }

    const attemptId = beginAuthAttempt("customer_login");
    attemptIdRef.current = attemptId;
    setLoading(true);

    const isStale = () => attemptIdRef.current !== attemptId;
    const finishAttempt = (result) => {
      endAuthAttempt(attemptId, result);
      if (attemptIdRef.current !== attemptId) return;
      attemptIdRef.current = 0;
      setLoading(false);
    };

    try {
      const signInStart = typeof performance !== "undefined" ? performance.now() : Date.now();
      const signInResult = await withTimeout(
        client.auth.signInWithPassword({ email, password }),
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
      const { data, error: signInError } = signInResult;

      if (isStale()) return;
      if (signInError) throw signInError;
      suppressAuthUiResetForCredentialsError();

      const session = data?.session;
      if (!session) {
        setError("Login succeeded but no session was returned. Try again.");
        return;
      }

      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData?.session) throw new Error("No session after login.");

      const profileStart = typeof performance !== "undefined" ? performance.now() : Date.now();
      const profileResult = await withTimeout(
        client
          .from("users")
          .select("role,is_internal,account_status")
          .eq("id", session.user.id)
          .single(),
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
      const { data: profile, error: profileError, status: profileStatus } = profileResult;

      if (isStale()) return;
      if (profileError && profileStatus !== 406) {
        console.warn("Customer login role lookup failed", profileError);
      }
      const accountStatus = normalizeAccountStatus(profile?.account_status);
      if (isBlockedAccountStatus(accountStatus)) {
        suppressAuthUiResetForCredentialsError();
        setError(GENERIC_INVALID_CREDENTIALS_MESSAGE);
        try {
          await client.auth.signOut({ scope: "local" });
        } catch {}
        return;
      }

      let isAdmin = profile?.is_internal === true;
      const normalizedRole =
        typeof profile?.role === "string" ? profile.role.trim().toLowerCase() : "";
      if (normalizedRole.startsWith("admin")) {
        isAdmin = true;
      }

      if (!isAdmin) {
        const adminRoleResult = await withTimeout(
          client
            .from("admin_role_members")
            .select("role_key")
            .eq("user_id", session.user.id)
            .limit(1),
          profileTimeoutMs,
          `Admin role lookup timed out after ${Math.round(profileTimeoutMs / 1000)}s`
        );
        if (!adminRoleResult?.error && (adminRoleResult?.data?.length || 0) > 0) {
          isAdmin = true;
        }
      }

      const requestedPath = getNextParam();
      if (process.env.NODE_ENV !== "production") {
        console.info("[auth-next] auth submit next:", requestedPath || "/");
      }
      const intentPath =
        requestedPath ||
        consumeAuthIntent({
          role: "customer",
          fallbackPath: "/",
        });
      const roleForRedirect = isAdmin
        ? "admin"
        : normalizedRole === "business"
          ? "business"
          : "customer";
      const dest = getPostLoginRedirect({
        role: roleForRedirect,
        requestedPath: intentPath || requestedPath,
      });
      if (process.env.NODE_ENV !== "production") {
        console.info("[auth-next] login success next:", requestedPath || null);
        console.info(
          "[auth-next] login success fallback:",
          requestedPath ? null : intentPath || null
        );
        console.info("[auth-next] final redirect destination:", dest);
      }
      if (process.env.NODE_ENV !== "production") {
        console.info("[AUTH_REDIRECT_TRACE] customer_login_submit", {
          role: roleForRedirect,
          requestedPath,
          intentPath,
          chosenDestination: dest,
          persistedRedirectState: readClientRedirectState(),
        });
      }

      try {
        if (refreshControllerRef.current) {
          refreshControllerRef.current.abort();
        }
        const refreshController = new AbortController();
        refreshControllerRef.current = refreshController;

        const refreshStart = typeof performance !== "undefined" ? performance.now() : Date.now();
        const res = await fetchWithTimeout("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: session?.access_token,
            refresh_token: session?.refresh_token,
          }),
          timeoutMs: refreshTimeoutMs,
          signal: refreshController.signal,
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
          status: res?.status ?? null,
          error: res?.ok ? null : `HTTP ${res.status}`,
        });

        if (isStale()) {
          refreshControllerRef.current = null;
          return;
        }
        const refreshed = res.headers.get("x-auth-refresh-user") === "1";
        if (!refreshed) {
          refreshControllerRef.current = null;
          setError("We couldn't finish signing you in. Please try again.");
          return;
        }
        refreshControllerRef.current = null;
      } catch (err) {
        refreshControllerRef.current = null;
        if (!isTimeoutError(err)) {
          console.error("Auth refresh call failed", err);
        }
        setError(
          isTimeoutError(err)
            ? "Session persistence timed out. Please check your connection and try again."
            : "We couldn't finish signing you in. Please try again."
        );
        return;
      }

      onSuccess?.(dest, { isAdmin });
      if (isAdmin) {
        if (process.env.NODE_ENV !== "production") {
          console.info("[auth-next] post-login replace:", dest);
        }
        window.location.replace(dest);
        return;
      }
      if (process.env.NODE_ENV !== "production") {
        console.info("[auth-next] post-login replace:", dest);
      }
      window.location.replace(dest);
    } catch (err) {
      if (isStale()) return;
      if (!isGenericInvalidCredentialsError(err) && !isTimeoutError(err)) {
        console.error("Customer login failed", err);
      }
      setError(
        isTimeoutError(err)
          ? "Login request timed out. Please check your connection and try again."
          : isGenericInvalidCredentialsError(err)
            ? GENERIC_INVALID_CREDENTIALS_MESSAGE
            : "Login failed. Please try again."
      );
    } finally {
      finishAttempt("password");
    }
  }

  async function handleGoogleLogin() {
    setError("");

    let attemptId = 0;
    try {
      const client = supabase ?? getSupabaseBrowserClient();
      if (!client || !client.auth) {
        setError("Auth is unavailable. Please refresh and try again.");
        return;
      }

      attemptId = beginAuthAttempt("customer_oauth");
      attemptIdRef.current = attemptId;
      setLoading(true);

      const queryNext = getNextParam();
      const storedIntent =
        queryNext ||
        sanitizeAuthRedirectPath(consumeAuthIntent({ role: "customer", fallbackPath: "/" }), "/");

      const currentOrigin = window.location.origin;
      const redirectTo = buildOAuthCallbackUrl({
        currentOrigin,
        next: storedIntent,
      });
      logOAuthStart({ provider: "google", redirectTo, currentOrigin });

      const { error: oauthError } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      if (attemptIdRef.current !== attemptId) return;
      if (oauthError) {
        clearAuthIntent();
        setError(oauthError.message);
      }
    } catch (err) {
      clearAuthIntent();
      console.error("Customer OAuth login failed", err);
      setError("Login failed. Please try again.");
    } finally {
      if (attemptId) {
        const finished = endAuthAttempt(attemptId, "oauth");
        if (finished) {
          attemptIdRef.current = 0;
          setLoading(false);
        }
      }
    }
  }

  return (
    <>
      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="customer-login-email" className="text-sm text-slate-700">Email</label>
          <input
            id="customer-login-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder-slate-400 transition focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
            disabled={loading || loadingUser}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="customer-login-password" className="text-sm text-slate-700">Password</label>
          <input
            id="customer-login-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 placeholder-slate-400 transition focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
            disabled={loading || loadingUser}
          />
          <div className="mt-3 pb-1 text-right">
            <Link href="/auth/forgot-password" className="text-sm text-gray-500 transition hover:text-gray-700 hover:underline focus-visible:underline">
              Forgot password?
            </Link>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading || loadingUser}
          className="yb-primary-button w-full rounded-xl py-3 text-base font-semibold text-white"
        >
          {loading ? "Logging in..." : "Log in"}
        </button>
      </form>

      <div className="mt-4">
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading || loadingUser}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 font-medium text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <img src="/google-icon.svg" className="h-5 w-5" alt="Google" />
          Continue with Google
        </button>
      </div>

      <p className="mt-4 text-center text-sm text-slate-700">
        New to YourBarrio?{" "}
        <button
          type="button"
          onClick={() => onSwitchToSignup?.() || modal?.openModal?.("customer-signup")}
          className="font-semibold text-pink-600 hover:underline"
        >
          Create an account
        </button>
      </p>
    </>
  );
}
