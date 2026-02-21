"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { clearClientRedirectState } from "@/lib/auth/clientRedirectState";

type AdminLogoutButtonProps = {
  children: ReactNode;
  className: string;
  title?: string;
  ariaLabel?: string;
};

function nowMs() {
  if (typeof performance === "undefined") return Date.now();
  return performance.now();
}

function logPerf(step: string, payload?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  const suffix = payload ? ` ${JSON.stringify(payload)}` : "";
  console.info(`[ADMIN_LOGOUT_PERF] ${step}${suffix}`);
}

export default function AdminLogoutButton({
  children,
  className,
  title,
  ariaLabel,
}: AdminLogoutButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const clickStartRef = useRef<number | null>(null);

  useEffect(() => {
    logPerf("pathname_change", { pathname });
  }, [pathname]);

  useEffect(
    () => () => {
      const clickStart = clickStartRef.current;
      logPerf("component_unmount", {
        elapsedMs: clickStart == null ? null : Number((nowMs() - clickStart).toFixed(2)),
      });
    },
    []
  );

  async function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation?.();
    if (isLoggingOut) return;

    const clickStart = nowMs();
    clickStartRef.current = clickStart;
    setIsLoggingOut(true);
    logPerf("click_start");
    clearClientRedirectState();
    logPerf("redirect_state_cleared");

    const signOutStart = nowMs();
    logPerf("signout_start");
    void logout({ redirectTo: "/", reason: "admin_logout_ui" })
      .then(() => {
        logPerf("signout_end", {
          elapsedMs: Number((nowMs() - signOutStart).toFixed(2)),
        });
      })
      .catch((error: unknown) => {
        logPerf("signout_error", {
          elapsedMs: Number((nowMs() - signOutStart).toFixed(2)),
          message: error instanceof Error ? error.message : String(error),
        });
      });

    logPerf("router_replace_call", {
      elapsedMs: Number((nowMs() - clickStart).toFixed(2)),
    });
    router.replace("/");
  }

  return (
    <button
      type="button"
      data-admin-logout="1"
      title={title}
      aria-label={ariaLabel}
      onClick={handleClick}
      disabled={isLoggingOut}
      className={className}
    >
      {children}
    </button>
  );
}

/*
MANUAL VERIFICATION CHECKLIST
1) Open /admin on desktop, click "Log out", and confirm redirect to "/" feels immediate.
2) Open /admin on mobile menu, click "Log out", and confirm drawer closes immediately and redirect happens right away.
3) After redirect, revisit /admin and confirm auth guard sends you back to sign-in (session cleared).
*/
