"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import HomeRenderTrace from "@/components/debug/HomeRenderTrace";

const diagEnabled = () => process.env.NEXT_PUBLIC_CLICK_DIAG === "1";

export default function HomeGuard({ children, fallback = null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, profile, role, loadingUser } = useAuth();

  const blocker = useMemo(() => {
    if (loadingUser) return "AUTH_LOADING";
    if (!user) return "NO_USER";
    if (!profile) return "NO_PROFILE";
    if (role && role !== "customer") return "ROLE_MISMATCH";
    return null;
  }, [loadingUser, profile, role, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const redirectOnce = (target) => {
      const url = new URL(target, window.location.origin);
      if (pathname === url.pathname) return;
      router.replace(`${url.pathname}${url.search}`);
    };

    if (blocker === "NO_USER") {
      redirectOnce("/");
    }
    if (blocker === "ROLE_MISMATCH") {
      redirectOnce("/go/dashboard");
    }
  }, [blocker, pathname, router, searchParams]);

  const message = (() => {
    switch (blocker) {
      case "AUTH_LOADING":
        return "Loading your account…";
      case "NO_USER":
        return "Redirecting to login…";
      case "NO_PROFILE":
        return "Loading profile…";
      case "ROLE_MISMATCH":
        return "Switching account…";
      default:
        return null;
    }
  })();

  if (blocker) {
    return (
      <>
        {fallback || null}
        <HomeRenderTrace blocker={blocker} />
      </>
    );
  }

  return (
    <>
      <HomeRenderTrace blocker={blocker} />
      {children}
    </>
  );
}
