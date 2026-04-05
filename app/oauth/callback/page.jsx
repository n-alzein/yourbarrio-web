"use client";

import { useEffect, useRef, useState } from "react";

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

function safeReadLocalStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export default function OauthCallbackPage() {
  const redirectingRef = useRef(false);
  const [trace, setTrace] = useState(null);

  const continueToCallback = (finalCallbackUrl) => {
    if (!finalCallbackUrl) return;
    clearAuthFlowState();
    window.location.replace(finalCallbackUrl);
  };

  useEffect(() => {
    if (typeof window === "undefined" || redirectingRef.current) return;

    const incoming = new URL(window.location.href);
    const callback = new URL("/api/auth/callback", window.location.origin);
    incoming.searchParams.forEach((value, key) => {
      callback.searchParams.set(key, value);
    });

    const debug = incoming.searchParams.get("debug") === "1";
    const existingNext = callback.searchParams.get("next");
    const storedRedirect = getSafeStoredRedirect();
    const flow = safeReadLocalStorage("yb_auth_flow");

    if (
      storedRedirect &&
      (!existingNext || existingNext === "/" || flow === "business-register")
    ) {
      callback.searchParams.set("next", storedRedirect);
    }

    const tracePayload = {
      incomingUrl: incoming.toString(),
      existingNext,
      storedRedirect,
      flow,
      finalCallbackUrl: callback.toString(),
    };
    console.warn("[AUTH_REDIRECT_TRACE] oauth_callback_bridge", tracePayload);

    if (debug) {
      const timeoutId = window.setTimeout(() => {
        setTrace(tracePayload);
      }, 0);
      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    redirectingRef.current = true;
    continueToCallback(tracePayload.finalCallbackUrl);
  }, []);

  if (trace) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-10 bg-white">
        <div className="w-full max-w-2xl rounded-2xl border border-[var(--yb-border)] bg-white p-6 space-y-4">
          <h1 className="text-2xl font-bold text-slate-900">OAuth Callback Trace</h1>
          <p className="text-sm text-slate-600">
            Debug mode is enabled. Review values below, then continue.
          </p>
          <div className="rounded-xl bg-slate-50 border border-[var(--yb-border)] p-4 text-sm text-slate-800 space-y-2">
            <p><span className="font-semibold">incomingUrl:</span> {trace.incomingUrl}</p>
            <p><span className="font-semibold">existingNext:</span> {String(trace.existingNext)}</p>
            <p><span className="font-semibold">storedRedirect:</span> {String(trace.storedRedirect)}</p>
            <p><span className="font-semibold">flow:</span> {String(trace.flow)}</p>
            <p className="break-all">
              <span className="font-semibold">finalCallbackUrl:</span> {trace.finalCallbackUrl}
            </p>
          </div>
          <button
            type="button"
            onClick={() => continueToCallback(trace.finalCallbackUrl)}
            className="yb-primary-button w-full rounded-xl py-3 font-semibold text-white"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <p className="text-sm text-slate-600">Completing sign in...</p>
    </div>
  );
}
