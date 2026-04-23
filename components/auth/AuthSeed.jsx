"use client";

import { useLayoutEffect } from "react";
import { useAuth } from "@/components/AuthProvider";

export default function AuthSeed({
  user = null,
  profile = null,
  business = null,
  role = null,
  supportModeActive = false,
}) {
  const { seedAuthState } = useAuth();

  useLayoutEffect(() => {
    if (typeof seedAuthState !== "function") return;
    seedAuthState({
      initialUser: user ?? null,
      initialProfile: profile ?? null,
      initialBusiness: business ?? null,
      initialRole: role ?? null,
      supportModeActive: Boolean(supportModeActive),
    });
  }, [seedAuthState, user, profile, business, role, supportModeActive]);

  return null;
}
