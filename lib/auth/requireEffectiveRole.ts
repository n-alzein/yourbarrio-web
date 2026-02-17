import "server-only";

import { requireRole } from "@/lib/auth/server";
import { getRequestPath } from "@/lib/url/getRequestPath";
import { redirectIfAllowed } from "@/lib/next/redirectIfAllowed";

type SupportedRole = "business" | "customer";

type EffectiveRoleContext = {
  supabase: any;
  user: any;
  authUser: any;
  effectiveUserId: string;
  actorUserId: string;
  supportMode: boolean;
  targetRole: "business" | "customer" | null;
  homePath: string;
  effectiveProfile: any | null;
  actorProfile: any | null;
};

export async function requireEffectiveRole(
  role: SupportedRole
): Promise<EffectiveRoleContext> {
  const context = await requireRole(role);
  const requestPath = await getRequestPath(
    role === "business" ? "/business/dashboard" : "/customer/home"
  );
  const diagEnabled = String(process.env.NEXT_PUBLIC_AUTH_DIAG || "") === "1";

  if (diagEnabled) {
    console.warn("[AUTH_DIAG] requireEffectiveRole", {
      role,
      requestPath,
      actorUserId: context.actorUserId,
      effectiveUserId: context.effectiveUserId,
      supportMode: context.supportMode,
      targetRole: context.supportTargetRole ?? null,
    });
  }

  if (context.supportMode && context.effectiveUserId === context.actorUserId) {
    if (diagEnabled) {
      console.warn("[AUTH_DIAG] requireEffectiveRole:resolver_bug", {
        role,
        requestPath,
        actorUserId: context.actorUserId,
        effectiveUserId: context.effectiveUserId,
      });
    }
    await redirectIfAllowed("/admin/impersonation?error=resolver-bug");
  }

  return {
    supabase: context.supabase,
    user: context.user,
    authUser: context.authUser,
    effectiveUserId: context.effectiveUserId,
    actorUserId: context.actorUserId,
    supportMode: context.supportMode,
    targetRole: context.supportTargetRole ?? null,
    homePath:
      context.supportHomePath ||
      (role === "business" ? "/business/dashboard" : "/customer/home"),
    effectiveProfile: context.effectiveProfile ?? null,
    actorProfile: context.actorProfile ?? null,
  };
}
