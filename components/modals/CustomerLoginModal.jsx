"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import BaseModal from "./BaseModal";
import { useAuth } from "../AuthProvider";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useModal } from "./ModalProvider";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { withTimeout } from "@/lib/withTimeout";
import { resolvePostLoginTarget } from "@/lib/auth/redirects";
import { isAdminProfile } from "@/lib/auth/isAdmin";

export default function CustomerLoginModal({ onClose, next: nextFromModalProps = null }) {
  const {
    supabase,
    loadingUser,
    beginAuthAttempt,
    endAuthAttempt,
    authAttemptId,
    authStatus,
    user,
    role,
  } = useAuth();
  const { openModal } = useModal();
  const router = useRouter();
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
    if (typeof nextFromModalProps === "string" && nextFromModalProps.trim()) {
      return nextFromModalProps.trim();
    }
    if (typeof window === "undefined") return null;
    const params =
      searchParams ?? new URLSearchParams(window.location.search || "");
    const keys = ["returnUrl", "next", "callbackUrl"];
    for (const key of keys) {
      const value = params.get(key);
      if (!value) continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      try {
        return trimmed;
      } catch {
        continue;
      }
    }
    return null;
  }, [nextFromModalProps, searchParams]);

  const resolveLoginTarget = useCallback(
    (profileOverride, roleOverride) => {
      const next = getNextParam();
      const profileForRouting = profileOverride || null;
      const normalizedRole = roleOverride || null;
      const adminRoleHint = isAdminProfile(profileForRouting, [])
        ? ["admin_readonly"]
        : [];
      return resolvePostLoginTarget({
        profile: profileForRouting,
        role: normalizedRole,
        roles: adminRoleHint,
        next,
      });
    },
    [getNextParam]
  );

  useEffect(() => {
    if (!attemptIdRef.current) return;
    if (authAttemptId === attemptIdRef.current) return;
    attemptIdRef.current = 0;
    setLoading(false);
  }, [authAttemptId]);

  useEffect(() => {
    if (authStatus !== "authenticated" || !user?.id) return;
    if (refreshControllerRef.current) {
      refreshControllerRef.current.abort();
      refreshControllerRef.current = null;
    }
    if (attemptIdRef.current) {
      endAuthAttempt(attemptIdRef.current, "session");
      attemptIdRef.current = 0;
    }
    setLoading(false);
    const target = resolveLoginTarget(
      { role, is_internal: role === "internal" },
      role
    );
    onClose?.();
    router.replace(target);
    router.refresh();
  }, [authStatus, endAuthAttempt, onClose, resolveLoginTarget, role, router, user?.id]);

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
        supabaseType: typeof supabase,
        supabaseKeys: supabase ? Object.keys(supabase) : null,
        hasSupabaseAuth: Boolean(supabase?.auth),
        clientType: typeof client,
        clientKeys: client ? Object.keys(client) : null,
        hasClientAuth: Boolean(client?.auth),
        hasModalContext: typeof openModal === "function",
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

    if (authDiagEnabled) {
      console.log("[AUTH_DIAG] customer:login:begin", {
        attemptId,
        pathname: typeof window !== "undefined" ? window.location.pathname : null,
      });
    }

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
      if (signInError) {
        setError(signInError.message);
        return;
      }

      const user = data?.user;
      if (!user) {
        setError("Login succeeded but no user was returned. Try again.");
        return;
      }

      const profileStart = typeof performance !== "undefined" ? performance.now() : Date.now();
      const profileResult = await withTimeout(
        client.from("users").select("role,is_internal").eq("id", user.id).maybeSingle(),
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
      const { data: profile, error: profileError } = profileResult;

      if (isStale()) return;
      if (profileError) {
        setError("Logged in, but could not load your profile. Try again.");
        return;
      }

      const dest = resolveLoginTarget(profile, profile?.role);
      if (authDiagEnabled) {
        console.log("[AUTH_DIAG] customer-login:redirect:resolved", {
          role: profile?.role ?? role ?? null,
          isInternal: profile?.is_internal === true,
          next: getNextParam(),
          dest,
        });
      }

      onClose?.();

      const debugAuth = process.env.NEXT_PUBLIC_DEBUG_AUTH === "1";

      try {
        const session = data?.session;

        if (debugAuth) {
          console.log("[customer-login] refreshing cookies with tokens");
        }

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
        if (debugAuth) {
          console.log(
            "[customer-login] refresh user header",
            res.headers.get("x-auth-refresh-user")
          );
        }

        if (!refreshed) {
          refreshControllerRef.current = null;
          setError(
            "Login succeeded but session could not be persisted in Safari. Please try again."
          );
          return;
        }
        refreshControllerRef.current = null;
      } catch (err) {
        refreshControllerRef.current = null;
        console.error("Auth refresh call failed", err);
        setError(
          isTimeoutError(err)
            ? "Session persistence timed out. Please check your connection and try again."
            : "Login succeeded but session could not be persisted. Please try again."
        );
        return;
      }

      router.replace(dest);
      router.refresh();
    } catch (err) {
      if (isStale()) return;
      console.error("Customer login failed", err);
      setError(
        isTimeoutError(err)
          ? "Login request timed out. Please check your connection and try again."
          : "Login failed. Please try again."
      );
    } finally {
      finishAttempt("password");
      if (authDiagEnabled) {
        console.log("[AUTH_DIAG] customer:login:end", {
          attemptId,
          pathname: typeof window !== "undefined" ? window.location.pathname : null,
        });
      }
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

      const { error: oauthError } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: (() => {
            const origin = window.location.origin;
            const callback = new URL("/api/auth/callback", origin);
            const next = getNextParam();
            if (next) {
              callback.searchParams.set("next", next);
            }
            return callback.toString();
          })(),
        },
      });

      if (attemptIdRef.current !== attemptId) return;
      if (oauthError) {
        setError(oauthError.message);
      } else {
        onClose?.();
      }
    } catch (err) {
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
    <BaseModal
      title="Welcome back"
      description="Sign in to your customer account to continue exploring nearby businesses."
      onClose={onClose}
    >
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
            className="
              w-full px-4 py-3 rounded-xl 
              bg-slate-50 border border-slate-200 
              text-slate-900 placeholder-slate-400
              focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400
              transition
            "
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
            className="
              w-full px-4 py-3 rounded-xl 
              bg-slate-50 border border-slate-200 
              text-slate-900 placeholder-slate-400
              focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400
              transition
            "
            disabled={loading || loadingUser}
          />
          <div className="mt-2 text-right">
            <Link href="/auth/forgot-password" className="text-sm text-pink-600 font-semibold hover:underline">
              Forgot your password?
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
          className={`
            w-full py-3 rounded-xl font-semibold text-white text-base
            bg-gradient-to-r from-purple-600 via-pink-500 to-rose-500
            shadow-lg shadow-pink-500/30 
            hover:brightness-110 active:scale-[0.98]
            transition-all duration-200
            ${(loading || loadingUser) ? "opacity-60 cursor-not-allowed" : ""}
          `}
        >
          {loading ? "Logging in..." : "Log in"}
        </button>
      </form>

      <div className="mt-4">
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading || loadingUser}
          className="
            w-full py-3 rounded-xl font-medium
            bg-white border border-slate-200 text-slate-900
            hover:bg-slate-50
            flex items-center justify-center gap-2
            transition
            disabled:opacity-60 disabled:cursor-not-allowed
          "
        >
          <img src="/google-icon.svg" className="h-5 w-5" alt="Google" />
          Continue with Google
        </button>
      </div>

      <p className="mt-4 text-center text-sm text-slate-700">
        New to YourBarrio?{" "}
        <button
          type="button"
          onClick={() => openModal("customer-signup")}
          className="text-pink-600 font-semibold hover:underline"
        >
          Create an account
        </button>
      </p>
    </BaseModal>
  );
}
