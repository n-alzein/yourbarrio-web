"use client";

import { useEffect, useRef, useState } from "react";
import { PATHS } from "@/lib/auth/paths";

const MAX_WAIT_MS = 10_000;
const RETRY_DELAY_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function BusinessPostConfirmClient() {
  const redirectedRef = useRef(false);
  const [statusMessage, setStatusMessage] = useState("Finalizing your account...");

  useEffect(() => {
    let cancelled = false;

    async function resolveBusinessDestination() {
      const { getSupabaseBrowserClient } = await import("@/lib/supabase/browser");
      const { syncBusinessBrowserSessionToServer } = await import(
        "@/lib/auth/businessSessionSync"
      );
      const supabase = getSupabaseBrowserClient();
      const startedAt = Date.now();
      let attempt = 0;
      const host =
        typeof window !== "undefined" ? window.location.host : null;
      const pathname =
        typeof window !== "undefined"
          ? window.location.pathname
          : PATHS.auth.businessPostConfirm;

      while (!cancelled && !redirectedRef.current && Date.now() - startedAt < MAX_WAIT_MS) {
        attempt += 1;

        const {
          data: sessionData,
        } = await supabase.auth.getSession();
        const {
          data: userData,
        } = await supabase.auth.getUser();

        const session = sessionData?.session ?? null;
        const user = userData?.user ?? null;

        console.warn("[BUSINESS_REDIRECT_TRACE] post_confirm_attempt", {
          host,
          pathname,
          attempt,
          sessionExists: Boolean(session),
          userExists: Boolean(user?.id),
          userId: user?.id || null,
          destinationChosen: null,
          fellBackToLogin: false,
        });

        if (!session || !user?.id) {
          setStatusMessage("Still securing your session...");
          await sleep(RETRY_DELAY_MS);
          continue;
        }

        const syncResult = await syncBusinessBrowserSessionToServer(session);
        const destination = PATHS.auth.businessCreatePassword;

        console.warn("[BUSINESS_REDIRECT_TRACE] post_confirm_attempt", {
          host,
          pathname,
          attempt,
          sessionExists: true,
          userExists: true,
          userId: user.id,
          serverRefreshOk: syncResult.ok,
          serverRefreshHasUser: syncResult.serverHasUser,
          serverRefreshReason: syncResult.reason,
          destinationChosen: destination,
          fellBackToLogin: false,
        });

        if (!syncResult.serverHasUser) {
          setStatusMessage("Still securing your session...");
          await sleep(RETRY_DELAY_MS);
          continue;
        }

        redirectedRef.current = true;
        setStatusMessage("Session confirmed. Continuing...");
        window.location.replace(destination);
        return;
      }

      console.warn("[BUSINESS_REDIRECT_TRACE] post_confirm_timeout", {
        host,
        pathname,
        elapsedMs: Date.now() - startedAt,
        sessionExists: false,
        userExists: false,
        serverRefreshOk: false,
        serverRefreshHasUser: false,
        destinationChosen: `${PATHS.auth.businessLogin}?next=${encodeURIComponent(PATHS.auth.businessCreatePassword)}`,
        fellBackToLogin: true,
      });

      redirectedRef.current = true;
      window.location.replace(
        `${PATHS.auth.businessLogin}?next=${encodeURIComponent(PATHS.auth.businessCreatePassword)}`
      );
    }

    void resolveBusinessDestination();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="w-full max-w-md rounded-2xl border border-[var(--yb-border)] bg-white p-8 shadow-sm animate-fadeIn">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
        Finalizing sign-in
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{statusMessage}</p>
    </div>
  );
}
