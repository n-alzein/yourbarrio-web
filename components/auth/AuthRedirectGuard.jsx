"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { getBusinessSessionExpiredLoginPath, PATHS } from "@/lib/auth/paths";
import { isLogoutRedirectInFlight } from "@/lib/auth/logout";

export default function AuthRedirectGuard({ children, redirectTo }) {
  const { authStatus, user } = useAuth();
  const pathname = usePathname();
  const fallbackArmedRef = useRef(false);

  useEffect(() => {
    if (authStatus === "loading") return;
    if (authStatus === "authenticated" && user) return;

    const target =
      redirectTo ||
      (pathname?.startsWith("/business")
        ? getBusinessSessionExpiredLoginPath()
        : PATHS.auth.customerLogin);

    if (!target) return;
    if (pathname === target || pathname === `${target}/`) return;

    if (typeof window === "undefined") return;
    if (isLogoutRedirectInFlight()) return;
    if (fallbackArmedRef.current) return;
    fallbackArmedRef.current = true;
    window.location.assign(target);
  }, [authStatus, pathname, redirectTo, user]);

  if (authStatus === "loading") return null;
  if (authStatus !== "authenticated" || !user) return null;
  return <>{children}</>;
}
