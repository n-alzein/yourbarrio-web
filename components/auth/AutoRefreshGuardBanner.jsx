"use client";

import { useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";

const RETRY_EVENT = "yb-auto-refresh-retry";

export default function AutoRefreshGuardBanner() {
  const { refreshDisabledUntil, refreshDisabledReason } = useAuth();

  const isActive = useMemo(() => {
    if (!refreshDisabledReason) return false;
    if (!String(refreshDisabledReason).startsWith("rsc_loop_guard")) return false;
    return Number(refreshDisabledUntil || 0) > 0;
  }, [refreshDisabledReason, refreshDisabledUntil]);

  if (!isActive) return null;

  return (
    <div className="fixed left-1/2 top-[calc(5rem+12px)] z-[7000] -translate-x-1/2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 shadow-lg">
      <span>
        Automatic refresh is paused to prevent a navigation loop.
      </span>
      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event(RETRY_EVENT));
          }
        }}
        className="ml-3 rounded border border-amber-400 px-2 py-1 font-medium hover:bg-amber-100"
      >
        Retry now
      </button>
    </div>
  );
}
