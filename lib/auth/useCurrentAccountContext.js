"use client";

import { useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  buildCurrentAccountContext,
  normalizePublicUserRole,
} from "@/lib/auth/currentAccountContext";
import { isPurchaseRestrictedRole } from "@/lib/auth/purchaseAccess";

export function useCurrentAccountContext() {
  const { authStatus, user, profile } = useAuth();

  return useMemo(() => {
    const context = buildCurrentAccountContext({ user, profile });
    const role = normalizePublicUserRole(profile?.role);
    const rolePending =
      authStatus === "authenticated" && Boolean(user?.id) && !role;
    const purchaseRestricted =
      !rolePending &&
      authStatus === "authenticated" &&
      isPurchaseRestrictedRole({
        role,
        isInternal: profile?.is_internal === true,
      });

    return {
      ...context,
      role,
      authStatus,
      rolePending,
      purchaseRestricted,
      canPurchase:
        rolePending || authStatus !== "authenticated"
          ? null
          : purchaseRestricted
            ? false
            : role === "customer",
    };
  }, [authStatus, profile, user]);
}
