/*
AUTH AUDIT REPORT
- Client auth calls: business-auth login/register pages, customer login/signup modals.
- Navbar auth decisions: CustomerNavbar/BusinessNavbar read AuthProvider state (now server-seeded).
- Middleware: no auth calls; matcher only targets protected groups.
- Server layouts/pages: auth/role enforcement now handled in group layouts.
- Flicker sources before refactor: client-side redirects on public landing, client navbars waiting on AuthProvider loading,
  AuthProvider polling/refresh logic, middleware auth checks on broad matcher.
*/
"use server";

import { cache } from "react";
import {
  getProfileCached,
  getSupabaseServerClient,
  getUserCached,
} from "@/lib/supabaseServer";
import { getBusinessSessionExpiredLoginPath, PATHS } from "@/lib/auth/paths";
import { getRequestPath } from "@/lib/url/getRequestPath";
import { getEffectiveActorAndTarget } from "@/lib/admin/supportMode";
import { getSupportModeEffectiveUser } from "@/lib/admin/supportModeEffectiveUser";
import { createServerTiming, logServerTiming, perfTimingEnabled } from "@/lib/serverTiming";
import { isNavigationRequest, isRscFlightRequest } from "@/lib/next/requestKind";
import { redirectIfAllowed } from "@/lib/next/redirectIfAllowed";
import {
  getAccountDeletedRedirectPath,
  isBlockedAccountStatus,
  normalizeAccountStatus,
} from "@/lib/accountDeletion/status";

const getServerSupabase = cache(async () => {
  return getSupabaseServerClient();
});

export const getServerAuth = cache(async () => {
  const timing = createServerTiming("auth_");
  const t0 = timing.start();
  const supabase = await getServerSupabase();
  const supabaseMs = timing.end("supabase", t0);
  const t1 = timing.start();
  const { user } = await getUserCached(supabase);
  const userMs = timing.end("user", t1);

  if (!user) {
    if (await perfTimingEnabled()) {
      await logServerTiming("getServerAuth", {
        supabaseMs,
        userMs,
        totalMs: Math.round(supabaseMs + userMs),
      });
    }
    return { supabase, user: null };
  }

  if (await perfTimingEnabled()) {
    await logServerTiming("getServerAuth", {
      supabaseMs,
      userMs,
      totalMs: Math.round(supabaseMs + userMs),
    });
  }
  return { supabase, user: user ?? null };
});

export async function getProfile(userId, supabaseOverride) {
  if (!userId) return null;
  const timing = createServerTiming("profile_");
  const t0 = timing.start();
  const supabase = supabaseOverride ?? (await getServerSupabase());
  const supabaseMs = timing.end("supabase", t0);
  const t1 = timing.start();
  const profile = await getProfileCached(userId, supabase);
  const profileMs = timing.end("query", t1);
  if (await perfTimingEnabled()) {
    await logServerTiming("getProfile", {
      supabaseMs,
      profileMs,
      totalMs: Math.round(supabaseMs + profileMs),
    });
  }
  return profile;
}

export async function requireUser() {
  const timing = createServerTiming("requireUser_");
  const t0 = timing.start();
  const { supabase, user } = await getServerAuth();
  const authMs = timing.end("auth", t0);
  if (!user) {
    if (!(await redirectIfAllowed(PATHS.auth.customerLogin))) {
      return { supabase, user: null, unauthorized: true };
    }
  }
  if (await perfTimingEnabled()) {
    await logServerTiming("requireUser", { authMs });
  }
  return { supabase, user };
}

export async function requireRole(role) {
  const guardDiagEnabled =
    String(process.env.AUTH_GUARD_DIAG || "") === "1" ||
    String(process.env.NEXT_PUBLIC_AUTH_DIAG || "") === "1";
  const requestPath = await getRequestPath(
    role === "business" ? PATHS.business.dashboard : PATHS.customer.home
  );
  const requestedSurface = requestPath.startsWith("/customer")
    ? "customer"
    : requestPath.startsWith("/business")
      ? "business"
      : "public/admin";
  const timing = createServerTiming("requireRole_");
  const t0 = timing.start();
  const { supabase, user } = await getServerAuth();
  const authMs = timing.end("auth", t0);
  const isRscFlight = await isRscFlightRequest();
  const isNavigation = await isNavigationRequest();
  const canRedirect = isNavigation && !isRscFlight;

  const rscUnauthorizedResult = (effectiveUser = null, context = {}) => ({
    supabase,
    user: effectiveUser,
    authUser: user ?? null,
    profile: null,
    effectiveProfile: null,
    actorProfile: null,
    actorUserId: user?.id ?? null,
    effectiveRole: null,
    supportHomePath: null,
    supportTargetRole: null,
    supportMode: false,
    effectiveUserId: "",
    unauthorized: true,
    ...context,
  });

  if (!user) {
    const fallbackPath =
      role === "business" ? PATHS.business.dashboard : PATHS.customer.home;
    const nextPath = await getRequestPath(fallbackPath);
    if (guardDiagEnabled) {
      console.warn("[AUTH_GUARD_DIAG] requireRole:unauthenticated", {
        guard: `requireRole(${role})`,
        nextPath,
        requestPath,
      });
    }
    if (!canRedirect) {
      return rscUnauthorizedResult();
    }
    if (
      !(await redirectIfAllowed(
        role === "business"
          ? getBusinessSessionExpiredLoginPath({ next: nextPath })
          : `${PATHS.auth.customerLogin}?next=${encodeURIComponent(nextPath)}`
      ))
    ) {
      return rscUnauthorizedResult();
    }
  }

  const t1 = timing.start();
  const supportMode = await getEffectiveActorAndTarget(user.id);
  const supportEffectiveUser = await getSupportModeEffectiveUser(user.id);
  const supportModeActive = supportEffectiveUser.isSupportMode;
  const effectiveUserId = supportModeActive
    ? supportEffectiveUser.targetUserId
    : user.id;
  const profile = await getProfile(effectiveUserId, supabase);
  const authUserProfile = supportModeActive
    ? await getProfile(user.id, supabase)
    : profile;
  const profileMs = timing.end("profile", t1);
  const resolvedRole = supportModeActive
    ? supportEffectiveUser.targetRole
    : profile?.role || user?.app_metadata?.role || null;
  const authUserRole =
    authUserProfile?.role || user?.app_metadata?.role || null;
  const accountStatus = normalizeAccountStatus(profile?.account_status);
  const { data: adminRoleRows } = await supabase
    .from("admin_role_members")
    .select("role_key")
    .eq("user_id", user.id);
  const adminRoleKeys = Array.isArray(adminRoleRows)
    ? adminRoleRows.map((row) => row?.role_key).filter(Boolean)
    : [];
  const isAdmin = authUserRole === "admin" || adminRoleKeys.length > 0;

  if (guardDiagEnabled) {
    console.warn("[AUTH_GUARD_DIAG] requireRole:resolved", {
      guard: `requireRole(${role})`,
      userId: user?.id || null,
      email: user?.email || null,
      resolvedRole,
      isInternal: authUserProfile?.is_internal === true,
      isAdmin,
      supportMode: supportModeActive,
      supportModeSessionId: supportModeActive ? supportEffectiveUser.sessionId : null,
      supportModeCookieTargetRole: supportMode.cookieTargetRole ?? null,
      supportModeReason: supportMode.reason,
      supportModeHasCookies: supportMode.hasCookies,
      requestedSurface,
      effectiveUserId,
      authUserId: user.id,
      requestPath,
      accountStatus,
    });
  }

  if (isBlockedAccountStatus(accountStatus)) {
    const deletedPath = getAccountDeletedRedirectPath();
    if (!canRedirect) {
      return rscUnauthorizedResult({ ...user, id: effectiveUserId }, {
        supportMode: supportModeActive,
        supportTargetRole: supportEffectiveUser.targetRole,
        supportHomePath: supportModeActive ? supportMode.homePath : null,
        effectiveUserId,
      });
    }
    if (!(await redirectIfAllowed(deletedPath))) {
      return rscUnauthorizedResult({ ...user, id: effectiveUserId }, {
        supportMode: supportModeActive,
        supportTargetRole: supportEffectiveUser.targetRole,
        supportHomePath: supportModeActive ? supportMode.homePath : null,
        effectiveUserId,
      });
    }
  }

  if (supportModeActive) {
    const isAllowedSurface =
      (requestedSurface === "customer" &&
        supportEffectiveUser.targetRole === "customer") ||
      (requestedSurface === "business" &&
        supportEffectiveUser.targetRole === "business");
    if (!isAllowedSurface && requestedSurface !== "public/admin") {
      if (guardDiagEnabled) {
        console.warn("[guard][wrong-surface]", {
          requestPath,
          requestedSurface,
          supportMode: supportEffectiveUser.isSupportMode,
          targetRole: supportEffectiveUser.targetRole,
          effectiveRole: resolvedRole,
          actorUserId: user.id,
        });
      }
      if (!canRedirect) {
        return rscUnauthorizedResult({ ...user, id: effectiveUserId }, {
          supportMode: supportModeActive,
          supportTargetRole: supportEffectiveUser.targetRole,
          supportHomePath: supportModeActive ? supportMode.homePath : null,
          effectiveUserId,
        });
      }
      if (!(await redirectIfAllowed("/admin/impersonation?error=wrong-surface"))) {
        return rscUnauthorizedResult({ ...user, id: effectiveUserId }, {
          supportMode: supportModeActive,
          supportTargetRole: supportEffectiveUser.targetRole,
          supportHomePath: supportModeActive ? supportMode.homePath : null,
          effectiveUserId,
        });
      }
    }
  }

  if (!supportModeActive && role === "customer" && resolvedRole !== "customer") {
    if (isAdmin) {
      if (guardDiagEnabled) {
        const reasonCode = supportMode.hasCookies
          ? `ADMIN_NOT_IN_SUPPORT_MODE_${String(supportMode.reason || "unknown")
              .replace(/-/g, "_")
              .toUpperCase()}`
          : "ADMIN_NOT_IN_SUPPORT_MODE_SUPPORT_MODE_COOKIE_MISSING";
        console.warn("[AUTH_GUARD_DIAG] requireRole:redirect", {
          guard: `requireRole(${role})`,
          reason: reasonCode,
          to: "/admin",
          supportModeReason: supportMode.reason,
          supportModeHasCookies: supportMode.hasCookies,
          requestPath,
        });
      }
      if (!canRedirect) {
        return rscUnauthorizedResult({ ...user, id: effectiveUserId }, {
          supportMode: supportModeActive,
          supportTargetRole: supportEffectiveUser.targetRole,
          supportHomePath: supportModeActive ? supportMode.homePath : null,
          effectiveUserId,
        });
      }
      if (!(await redirectIfAllowed("/admin"))) {
        return rscUnauthorizedResult({ ...user, id: effectiveUserId }, {
          supportMode: supportModeActive,
          supportTargetRole: supportEffectiveUser.targetRole,
          supportHomePath: supportModeActive ? supportMode.homePath : null,
          effectiveUserId,
        });
      }
    }
    if (guardDiagEnabled) {
        console.warn("[AUTH_GUARD_DIAG] requireRole:redirect", {
          guard: `requireRole(${role})`,
          reason: "NON_CUSTOMER_ROLE",
          to: PATHS.business.dashboard,
          requestPath,
        });
      }
    if (!canRedirect) {
      return rscUnauthorizedResult({ ...user, id: effectiveUserId }, {
        supportMode: supportModeActive,
        supportTargetRole: supportEffectiveUser.targetRole,
        supportHomePath: supportModeActive ? supportMode.homePath : null,
        effectiveUserId,
      });
    }
    if (!(await redirectIfAllowed(PATHS.business.dashboard))) {
      return rscUnauthorizedResult({ ...user, id: effectiveUserId }, {
        supportMode: supportModeActive,
        supportTargetRole: supportEffectiveUser.targetRole,
        supportHomePath: supportModeActive ? supportMode.homePath : null,
        effectiveUserId,
      });
    }
  }

  if (!supportModeActive && role === "business" && resolvedRole !== "business") {
    if (isAdmin) {
      if (guardDiagEnabled) {
        const reasonCode = supportMode.hasCookies
          ? `ADMIN_NOT_IN_SUPPORT_MODE_${String(supportMode.reason || "unknown")
              .replace(/-/g, "_")
              .toUpperCase()}`
          : "ADMIN_NOT_IN_SUPPORT_MODE_SUPPORT_MODE_COOKIE_MISSING";
        console.warn("[AUTH_GUARD_DIAG] requireRole:redirect", {
          guard: `requireRole(${role})`,
          reason: reasonCode,
          to: "/admin",
          supportModeReason: supportMode.reason,
          supportModeHasCookies: supportMode.hasCookies,
          requestPath,
        });
      }
      if (!canRedirect) {
        return rscUnauthorizedResult({ ...user, id: effectiveUserId }, {
          supportMode: supportModeActive,
          supportTargetRole: supportEffectiveUser.targetRole,
          supportHomePath: supportModeActive ? supportMode.homePath : null,
          effectiveUserId,
        });
      }
      if (!(await redirectIfAllowed("/admin"))) {
        return rscUnauthorizedResult({ ...user, id: effectiveUserId }, {
          supportMode: supportModeActive,
          supportTargetRole: supportEffectiveUser.targetRole,
          supportHomePath: supportModeActive ? supportMode.homePath : null,
          effectiveUserId,
        });
      }
    }
    if (guardDiagEnabled) {
        console.warn("[AUTH_GUARD_DIAG] requireRole:redirect", {
          guard: `requireRole(${role})`,
          reason: "NON_BUSINESS_ROLE",
          to: PATHS.customer.home,
          requestPath,
        });
      }
    if (!canRedirect) {
      return rscUnauthorizedResult({ ...user, id: effectiveUserId }, {
        supportMode: supportModeActive,
        supportTargetRole: supportEffectiveUser.targetRole,
        supportHomePath: supportModeActive ? supportMode.homePath : null,
        effectiveUserId,
      });
    }
    if (!(await redirectIfAllowed(PATHS.customer.home))) {
      return rscUnauthorizedResult({ ...user, id: effectiveUserId }, {
        supportMode: supportModeActive,
        supportTargetRole: supportEffectiveUser.targetRole,
        supportHomePath: supportModeActive ? supportMode.homePath : null,
        effectiveUserId,
      });
    }
  }

  if (await perfTimingEnabled()) {
    await logServerTiming("requireRole", {
      role,
      authMs,
      profileMs,
      totalMs: Math.round(authMs + profileMs),
    });
  }
  const effectiveUser = supportModeActive
    ? { ...user, id: effectiveUserId }
    : user;
  return {
    supabase,
    user: effectiveUser,
    authUser: user,
    profile,
    effectiveProfile: profile,
    actorProfile: authUserProfile,
    actorUserId: user.id,
    effectiveRole: resolvedRole,
    supportHomePath: supportModeActive ? supportMode.homePath : null,
    supportTargetRole: supportModeActive ? supportEffectiveUser.targetRole : null,
    supportMode: supportModeActive,
    effectiveUserId,
  };
}

/*
VERIFICATION CHECKLIST
- Cold load /customer/home: CustomerNavbar renders immediately when authed; unauthenticated redirects server-side to /.
- Cold load /business/dashboard: BusinessNavbar renders immediately when authed; unauthenticated redirects server-side to /business-auth/login.
- Navigate between customer pages: no public navbar flashes.
- Open 2 tabs: no redirect loops.
- Auth request count stable (no refresh_token loops).
*/
