"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { PATHS } from "@/lib/auth/paths";
import { buildOAuthCallbackUrl, logOAuthStart } from "@/lib/auth/oauthRedirect";

function BusinessRegisterInner() {
  const supabaseRef = useRef(null);
  const emailInputRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [authError, setAuthError] = useState("");

  const googleTarget = PATHS.business.onboarding || "/onboarding";
  const postAuthTarget = "/onboarding";
  const googleRedirectUrl = useMemo(() => {
    const currentOrigin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    return buildOAuthCallbackUrl({ currentOrigin, next: googleTarget });
  }, [googleTarget]);
  const getSupabase = useCallback(async () => {
    if (!supabaseRef.current) {
      const { getSupabaseBrowserClient } = await import("@/lib/supabase/browser");
      supabaseRef.current = getSupabaseBrowserClient();
    }
    return supabaseRef.current;
  }, []);

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());

  const isRateLimitError = (message) =>
    /rate|too many|throttl|retry/i.test(String(message || ""));

  async function sendMagicLink(emailValue) {
    try {
      try {
        localStorage.setItem("yb_post_auth_redirect", postAuthTarget);
        localStorage.setItem("yb_auth_flow", "business-register");
      } catch {}

      if (process.env.NODE_ENV !== "production") {
        console.log("[invite-flow] PATH=BUSINESS_REGISTER_CLIENT calling /api/auth/business-magic-link");
      }

      const response = await fetch("/api/auth/business-magic-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: emailValue,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = String(payload?.error || "");
        if (response.status === 429 || isRateLimitError(message)) {
          setAuthError("Too many attempts. Please wait a minute and try again.");
          return "rate_limit";
        }
        setAuthError("Unable to continue right now. Please try again.");
        return "hard_error";
      }
      return "sent";
    } catch {
      setAuthError("Unable to continue right now. Please try again.");
      return "hard_error";
    }
  }

  async function handleContinue(e) {
    e.preventDefault();
    setAuthError("");
    const normalizedEmail = email.trim();
    if (!isValidEmail(normalizedEmail)) {
      setAuthError("Enter a valid email address.");
      return;
    }

    setLoading(true);
    const result = await sendMagicLink(normalizedEmail);
    if (result === "sent") {
      setStep("sent");
    }
    setLoading(false);
  }

  async function handleResend() {
    setAuthError("");
    const normalizedEmail = email.trim();
    if (!isValidEmail(normalizedEmail)) {
      setAuthError("Enter a valid email address.");
      setStep("email");
      return;
    }

    setLoading(true);
    await sendMagicLink(normalizedEmail);
    setLoading(false);
  }

  function handleChangeEmail() {
    setAuthError("");
    setStep("email");
    requestAnimationFrame(() => {
      emailInputRef.current?.focus();
    });
  }

  async function handleGoogle() {
    setLoading(true);
    let supabase = null;
    try {
      supabase = await getSupabase();
    } catch {
      alert("Auth client not ready. Please refresh and try again.");
      setLoading(false);
      return;
    }
    logOAuthStart({
      provider: "google",
      redirectTo: googleRedirectUrl,
      currentOrigin: typeof window !== "undefined" ? window.location.origin : "",
    });
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: googleRedirectUrl,
      },
    });

    if (error) {
      setAuthError("Unable to continue with Google right now. Please try again.");
    }

    setLoading(false);
  }

  return (
    <div className="w-full max-w-md p-8 rounded-2xl border border-[var(--yb-border)] bg-white animate-fadeIn">
        <h1
          className="text-3xl font-extrabold text-center mb-3 tracking-tight text-slate-900"
        >
          Create Business Account
        </h1>

        <p className="text-center mb-6 text-slate-600">
          Start reaching local customers today
        </p>

        {authError ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {authError}
          </div>
        ) : null}

        {step === "email" ? (
          <>
            <form onSubmit={handleContinue} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900" htmlFor="business-email">
                  Email
                </label>
                <input
                  id="business-email"
                  ref={emailInputRef}
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (authError) setAuthError("");
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-white border border-[var(--yb-border)] text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--yb-focus)] focus:border-[var(--yb-focus)]"
                  required
                  autoComplete="email"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="yb-primary-button mt-2 w-full rounded-xl py-3 font-semibold text-white"
              >
                {loading ? "Sending..." : "Continue"}
              </button>
            </form>

            <p className="mt-3 text-center text-sm text-slate-500">
              We&apos;ll email you a link to verify and continue.
            </p>

            <div className="my-6 flex items-center gap-4">
              <div className="h-px flex-1 bg-[var(--yb-border)]" />
              <span className="text-xs text-slate-500">
                or
              </span>
              <div className="h-px flex-1 bg-[var(--yb-border)]" />
            </div>

            <button
              onClick={handleGoogle}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold border border-[var(--yb-border)] bg-white text-slate-900 transition hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <img src="/google-icon.svg" alt="" className="w-5 h-5" />
              Continue with Google
            </button>
          </>
        ) : (
          <div className="space-y-5">
            <h2 className="mb-1 text-2xl font-bold text-slate-900">Check your email</h2>
            <div className="rounded-xl border border-[var(--yb-border)] bg-slate-50 px-4 py-3 text-sm text-slate-700">
              We sent a verification link to <span className="font-semibold">{email.trim()}</span>.
              {" "}Open it to finish creating your business account.
            </div>
            <p className="pt-1 text-sm text-slate-500">
              Didn&apos;t get it? Check your spam.
            </p>
            <div className="pt-1 flex flex-col gap-0">
              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                className="yb-primary-button w-full rounded-xl py-3 font-semibold text-white"
              >
                {loading ? "Sending..." : "Resend email"}
              </button>
              <button
                type="button"
                onClick={handleChangeEmail}
                disabled={loading}
                className="mt-4 w-full py-3 rounded-xl font-semibold border border-[var(--yb-border)] bg-white text-slate-900 transition hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Change email
              </button>
            </div>
          </div>
        )}
    </div>
  );
}

export default function BusinessRegisterClient() {
  return <BusinessRegisterInner />;
}
