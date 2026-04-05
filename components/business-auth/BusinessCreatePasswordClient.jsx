"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BUSINESS_PASSWORD_MIN_LENGTH } from "@/lib/auth/businessPasswordGate";
import { PATHS } from "@/lib/auth/paths";

const SESSION_WAIT_MS = 10_000;
const SESSION_RETRY_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function EyeIcon({ open }) {
  return open ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6A3 3 0 0012 15a3 3 0 002.4-4.8" />
      <path d="M9.9 5.1A10.9 10.9 0 0112 5c5.5 0 9.3 4.2 10 7-.3 1.2-1.2 2.9-2.7 4.4" />
      <path d="M6.2 6.2C4.2 7.5 2.8 9.5 2 12c.7 2.8 4.5 7 10 7 1.8 0 3.4-.4 4.8-1.1" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function BusinessCreatePasswordClient({
  awaitSessionResolution = false,
}) {
  const router = useRouter();
  const resolvedRef = useRef(!awaitSessionResolution);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(!awaitSessionResolution);

  useEffect(() => {
    if (!awaitSessionResolution) return undefined;

    let cancelled = false;

    async function resolveSession() {
      const { getSupabaseBrowserClient } = await import("@/lib/supabase/browser");
      const { syncBusinessBrowserSessionToServer } = await import(
        "@/lib/auth/businessSessionSync"
      );
      const supabase = getSupabaseBrowserClient();
      const startedAt = Date.now();
      const pathname =
        typeof window !== "undefined"
          ? window.location.pathname
          : PATHS.auth.businessCreatePassword;
      const host = typeof window !== "undefined" ? window.location.host : null;
      let attempt = 0;

      while (!cancelled && !resolvedRef.current && Date.now() - startedAt < SESSION_WAIT_MS) {
        attempt += 1;
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const syncResult =
          session && user?.id
            ? await syncBusinessBrowserSessionToServer(session)
            : { ok: false, serverHasUser: false, reason: "session_unavailable" };

        console.warn("[BUSINESS_REDIRECT_TRACE] create_password_client_session_check", {
          host,
          pathname,
          attempt,
          sessionExists: Boolean(session),
          userExists: Boolean(user?.id),
          serverRefreshOk: syncResult.ok,
          serverRefreshHasUser: syncResult.serverHasUser,
          serverRefreshReason: syncResult.reason,
          chosenDestination: user?.id ? null : null,
          timeoutFallback: false,
        });

        if (session && user?.id && syncResult.serverHasUser) {
          resolvedRef.current = true;
          setReady(true);
          return;
        }

        await sleep(SESSION_RETRY_MS);
      }

      if (cancelled || resolvedRef.current) return;

      const destination = `${PATHS.auth.businessLogin}?next=${encodeURIComponent(
        PATHS.auth.businessCreatePassword
      )}`;
      console.warn("[BUSINESS_REDIRECT_TRACE] create_password_client_session_check", {
        host,
        pathname,
        attempt,
        sessionExists: false,
        userExists: false,
        serverRefreshOk: false,
        serverRefreshHasUser: false,
        chosenDestination: destination,
        timeoutFallback: true,
      });
      resolvedRef.current = true;
      window.location.replace(destination);
    }

    void resolveSession();

    return () => {
      cancelled = true;
    };
  }, [awaitSessionResolution]);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");

    if (!ready) {
      return;
    }

    if (password.length < BUSINESS_PASSWORD_MIN_LENGTH) {
      setErrorMessage(
        `Password must be at least ${BUSINESS_PASSWORD_MIN_LENGTH} characters.`
      );
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords must match.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/business-create-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          password,
          password_confirm: confirmPassword,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        setErrorMessage(
          payload?.message ||
            (payload?.error === "profile_update_failed"
              ? "Your password was updated, but we couldn't finish account setup. Please try again."
              : "We couldn't create your password. Please try again.")
        );
        setSubmitting(false);
        return;
      }

      router.replace(
        typeof payload?.redirectTo === "string" ? payload.redirectTo : "/onboarding"
      );
      router.refresh();
    } catch {
      setErrorMessage("We couldn't create your password. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-[var(--yb-border)] bg-white p-8 shadow-sm animate-fadeIn">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
        Create your password
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        {ready
          ? "Your email has been verified. Create a password to finish setting up your business account."
          : "Finalizing your verified session before password setup..."}
      </p>

      <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
        <label htmlFor="business-password" className="block text-sm font-medium text-slate-900">
          Password
        </label>
        <div className="relative">
          <input
            id="business-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-12 w-full rounded-xl border border-[var(--yb-border)] bg-white px-4 pr-12 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--yb-focus)] focus:border-[var(--yb-focus)]"
            placeholder={`Minimum ${BUSINESS_PASSWORD_MIN_LENGTH} characters`}
            autoComplete="new-password"
            disabled={submitting || !ready}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500 transition hover:text-slate-700"
            aria-label={showPassword ? "Hide password" : "Show password"}
            disabled={submitting || !ready}
          >
            <EyeIcon open={showPassword} />
          </button>
        </div>

        <label
          htmlFor="business-password-confirm"
          className="block text-sm font-medium text-slate-900"
        >
          Confirm password
        </label>
        <div className="relative">
          <input
            id="business-password-confirm"
            type={showConfirmPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="h-12 w-full rounded-xl border border-[var(--yb-border)] bg-white px-4 pr-12 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--yb-focus)] focus:border-[var(--yb-focus)]"
            placeholder="Re-enter your password"
            autoComplete="new-password"
            disabled={submitting || !ready}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword((value) => !value)}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500 transition hover:text-slate-700"
            aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
            disabled={submitting || !ready}
          >
            <EyeIcon open={showConfirmPassword} />
          </button>
        </div>

        <p className="text-xs text-slate-500">
          Use at least {BUSINESS_PASSWORD_MIN_LENGTH} characters.
        </p>

        {errorMessage ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting || !ready}
          className="yb-primary-button mt-2 inline-flex h-12 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold text-white"
        >
          {!ready ? "Finalizing session..." : submitting ? "Saving..." : "Create password"}
        </button>
      </form>
    </div>
  );
}
