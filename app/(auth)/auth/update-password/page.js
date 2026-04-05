"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const MIN_PASSWORD_LENGTH = 8;

function parseRecoveryHash(hashValue) {
  const hash = String(hashValue || "").replace(/^#/, "");
  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token") || "";
  const refreshToken = params.get("refresh_token") || "";
  const type = params.get("type") || "";
  return {
    hasRecoveryTokens: type === "recovery" && Boolean(accessToken) && Boolean(refreshToken),
    accessToken,
    refreshToken,
    type,
  };
}

function isPasswordReuseError(message) {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("reuse") ||
    normalized.includes("previously used") ||
    normalized.includes("old password") ||
    normalized.includes("different from the old password")
  );
}

function UpdatePasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const [sessionState, setSessionState] = useState("sessionEstablishing");
  const [sessionError, setSessionError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const didInitRef = useRef(false);

  useEffect(() => {
    let active = true;

    if (didInitRef.current) return;
    didInitRef.current = true;

    const setInvalidSession = (message) => {
      if (!active) return;
      setSessionError(message);
      setSessionState("sessionInvalid");
    };

    const init = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setInvalidSession("Unable to load authentication.");
        return;
      }

      if (errorParam) {
        setInvalidSession(errorDescription || "Recovery session not found or expired.");
        return;
      }

      const { hasRecoveryTokens, accessToken, refreshToken } = parseRecoveryHash(window.location.hash);

      if (hasRecoveryTokens) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          setInvalidSession("Recovery session not found or expired.");
          return;
        }

        window.history.replaceState({}, document.title, "/auth/update-password");
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setInvalidSession("Recovery session not found or expired.");
          return;
        }

        window.history.replaceState({}, document.title, "/auth/update-password");
      }

      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        setInvalidSession("Recovery session not found or expired.");
        return;
      }

      if (!active) return;
      setSessionError("");
      setSessionState("sessionValid");
    };

    init();

    return () => {
      active = false;
    };
  }, [code, errorDescription, errorParam]);

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");
    setStatusMessage("");

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setFormError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setFormError("Passwords must match.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setFormError("Unable to load authentication.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);

    if (error) {
      if (isPasswordReuseError(error.message)) {
        setFormError("You can't reuse your old password. Please choose a new one.");
      } else {
        setFormError("We couldn't update your password. Please try again.");
      }
      return;
    }

    setStatusMessage("Password updated. Redirecting to sign in...");
    router.push("/login");
  }

  return (
    <div className="min-h-screen w-full bg-white !text-slate-900">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-12">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Update your password</h1>
          <p className="mt-2 text-sm text-slate-600">Choose a new password for your account.</p>

          {sessionState === "sessionEstablishing" ? (
            <div className="mt-6 flex items-center gap-3 text-sm text-slate-600">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
              Verifying your reset link...
            </div>
          ) : null}

          {sessionState === "sessionValid" ? (
            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <label htmlFor="new-password" className="block text-sm text-slate-700">
                New password
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  placeholder={`Minimum ${MIN_PASSWORD_LENGTH} characters`}
                  autoComplete="new-password"
                />
              </label>

              <label htmlFor="confirm-password" className="block text-sm text-slate-700">
                Confirm new password
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                />
              </label>

              <p className="text-xs text-slate-500">Use at least 8 characters.</p>

              {formError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</div>
              ) : null}

              <button
                type="submit"
                disabled={saving}
                className="yb-primary-button inline-flex h-11 w-full items-center justify-center rounded-xl px-5 text-sm font-semibold text-white"
              >
                {saving ? "Updating..." : "Update password"}
              </button>
            </form>
          ) : null}

          {sessionState === "sessionInvalid" ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {sessionError || "Recovery session not found or expired."}
              </div>
              <button
                type="button"
                onClick={() => router.push("/auth/forgot-password")}
                className="yb-primary-button inline-flex h-11 w-full items-center justify-center rounded-xl px-5 text-sm font-semibold text-white"
              >
                Request a new reset link
              </button>
            </div>
          ) : null}

          {statusMessage ? (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {statusMessage}
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-between text-sm text-slate-600">
            <Link className="text-indigo-700 hover:text-indigo-600" href="/">
              Back to home
            </Link>
            <Link className="text-indigo-700 hover:text-indigo-600" href="/auth/forgot-password">
              Forgot password
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function UpdatePasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-white !text-slate-900">
          <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-12">
            <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
              <div className="mt-3 h-4 w-56 animate-pulse rounded bg-slate-200" />
              <div className="mt-6 flex items-center gap-3 text-sm text-slate-600">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
                Verifying your reset link...
              </div>
            </section>
          </main>
        </div>
      }
    >
      <UpdatePasswordContent />
    </Suspense>
  );
}
