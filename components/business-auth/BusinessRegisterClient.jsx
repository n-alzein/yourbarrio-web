"use client";

import { useState, useCallback, useRef } from "react";
import { getSupabaseAuthCookieName } from "@/lib/supabase/cookieName";
import { PATHS } from "@/lib/auth/paths";

function BusinessRegisterInner({ isPopup }) {
  const supabaseRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const redirectingRef = useRef(false);
  const sessionRef = useRef(null);

  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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

  const finishBusinessAuth = useCallback(() => {
    if (redirectingRef.current) return;
    redirectingRef.current = true;

    const target = PATHS.business.onboarding || "/business/onboarding";

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("business_auth_redirect", target);
        localStorage.setItem("business_auth_success", Date.now().toString());
      } catch (err) {
        console.warn("Could not broadcast business auth success", err);
      }

      if (isPopup) {
        window.close();

        setTimeout(() => {
          if (!window.closed) {
            window.location.replace(target);
          }
        }, 150);

        return;
      }
    }

    window.location.replace(target);
  }, [isPopup]);

  const redirectToOnboarding = useCallback(async () => {
    if (redirectingRef.current) return;
    await waitForAuthCookie();
    finishBusinessAuth();
  }, [finishBusinessAuth, waitForAuthCookie]);

  const getSupabase = useCallback(async () => {
    if (!supabaseRef.current) {
      const { getSupabaseBrowserClient } = await import("@/lib/supabase/browser");
      supabaseRef.current = getSupabaseBrowserClient();
    }
    return supabaseRef.current;
  }, []);

  async function handleRegister(e) {
    e.preventDefault();
    setLoading(true);
    let supabase = null;
    try {
      supabase = await getSupabase();
    } catch {
      alert("Auth client not ready. Please refresh and try again.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: businessName,
        },
      },
    });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    const user = data.user;
    sessionRef.current = data?.session ?? null;
    if (!user) {
      alert("Sign up failed. Try again.");
      setLoading(false);
      return;
    }

    const profilePayload = {
      id: user.id,
      role: "business",
      email,
      full_name: businessName,
      business_name: businessName,
      category: "",
      description: "",
      website: "",
      address: "",
      city: "",
      profile_photo_url: "",
    };

    const { error: insertError } = await supabase
      .from("users")
      .insert(profilePayload);

    if (insertError) {
      console.error("Profile insert error:", insertError);
      alert("Failed to create business profile.");
      setLoading(false);
      return;
    }

    const session = sessionRef.current;
    if (session?.access_token && session?.refresh_token) {
      await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }),
      });
    }

    await redirectToOnboarding();
    setLoading(false);
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
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/api/auth/callback`,
      },
    });

    if (error) {
      alert(error.message);
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

        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold border border-[var(--yb-border)] bg-white text-slate-900 transition hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <img src="/google-icon.svg" alt="" className="w-5 h-5" />
          Sign up with Google
        </button>

        <div className="my-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-[var(--yb-border)]" />
          <span className="text-xs text-slate-500">
            or
          </span>
          <div className="h-px flex-1 bg-[var(--yb-border)]" />
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-900" htmlFor="business-name">
              Business name
            </label>
            <input
              id="business-name"
              type="text"
              placeholder="Your business"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white border border-[var(--yb-border)] text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--yb-focus)] focus:border-[var(--yb-focus)]"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-900" htmlFor="business-email">
              Email
            </label>
            <input
              id="business-email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white border border-[var(--yb-border)] text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--yb-focus)] focus:border-[var(--yb-focus)]"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-900" htmlFor="business-password">
              Password
            </label>
            <input
              id="business-password"
              type="password"
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white border border-[var(--yb-border)] text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--yb-focus)] focus:border-[var(--yb-focus)]"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full py-3 rounded-xl font-semibold bg-[#6E34FF] text-white transition hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>
    </div>
  );
}

export default function BusinessRegisterClient({ isPopup = false }) {
  return <BusinessRegisterInner isPopup={isPopup} />;
}
