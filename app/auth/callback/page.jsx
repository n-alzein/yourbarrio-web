"use client";

import { useEffect, useRef } from "react";
import { buildOAuthCallbackUrl } from "@/lib/auth/oauthRedirect";

function getSafeStoredRedirect() {
  try {
    const stored = localStorage.getItem("yb_post_auth_redirect");
    if (!stored || typeof stored !== "string") return null;
    if (!stored.startsWith("/") || stored.startsWith("//")) return null;
    if (stored.toLowerCase().includes("http:") || stored.toLowerCase().includes("https:")) {
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

function clearAuthFlowState() {
  try {
    localStorage.removeItem("yb_post_auth_redirect");
    localStorage.removeItem("yb_auth_flow");
  } catch {}
}

export default function AuthCallbackPage() {
  const redirectingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || redirectingRef.current) return;
    redirectingRef.current = true;

    const incoming = new URL(window.location.href);
    const callback = new URL(
      buildOAuthCallbackUrl({ currentOrigin: window.location.origin })
    );
    incoming.searchParams.forEach((value, key) => {
      callback.searchParams.set(key, value);
    });

    if (!callback.searchParams.get("next")) {
      const storedRedirect = getSafeStoredRedirect();
      if (storedRedirect) {
        callback.searchParams.set("next", storedRedirect);
      }
    }

    clearAuthFlowState();
    window.location.replace(callback.toString());
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <p className="text-sm text-slate-600">Completing sign in...</p>
    </div>
  );
}
