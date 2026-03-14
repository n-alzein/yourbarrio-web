import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getCookieBaseOptions } from "@/lib/authCookies";
import { resolveCurrentUserRoleFromClient } from "@/lib/auth/getCurrentUserRole";
import {
  BUSINESS_CREATE_PASSWORD_PATH,
  getBusinessAuthCookieNames,
  logBusinessRedirectTrace,
} from "@/lib/auth/businessPasswordGate";
import { getRoleLandingPath } from "@/lib/auth/redirects";
import { isBusinessOnboardingComplete } from "@/lib/business/onboardingCompletion";
import {
  getAccountDeletedRedirectPath,
  isBlockedAccountStatus,
  normalizeAccountStatus,
} from "@/lib/accountDeletion/status";

const IMPERSONATE_USER_COOKIE = "yb_impersonate_user_id";
const IMPERSONATE_SESSION_COOKIE = "yb_impersonate_session_id";
const IMPERSONATE_TARGET_ROLE_COOKIE = "yb_impersonate_target_role";
const CUSTOMER_NEARBY_PUBLIC_FLAG_PATH = "/api/flags/customer-nearby-public";
const NEARBY_PUBLIC_COOKIE_NAME = "yb_nearby_public";

function shouldTraceAuthFlow(pathname) {
  if (!pathname) return false;
  return (
    pathname === "/business" ||
    pathname === "/business/" ||
    pathname === "/onboarding" ||
    pathname.startsWith("/onboarding/") ||
    pathname.startsWith("/business/")
  );
}

function logMiddlewareAuthTrace(request, payload = {}) {
  const pathname = request?.nextUrl?.pathname || "";
  const isBusinessAuthPath = pathname.startsWith("/business-auth/");
  if (!shouldTraceAuthFlow(pathname) && !isBusinessAuthPath) return;
  const authCookieNames = getBusinessAuthCookieNames(request.cookies.getAll());
  console.warn("[BUSINESS_REDIRECT_TRACE] middleware_auth", {
    host: request.headers.get("host") || request.nextUrl.host,
    pathname,
    authCookieNames,
    requestIncludesAuthCookies: authCookieNames.length > 0,
    ...payload,
  });
}

function isCustomerNearbyPath(pathname) {
  return pathname === "/customer/nearby" || pathname.startsWith("/customer/nearby/");
}

async function fetchCustomerNearbyPublicFlag(request) {
  // Dev verify: inspect /customer/nearby response headers x-nearby-mw + x-nearby-public-decision.
  try {
    const url = new URL(CUSTOMER_NEARBY_PUBLIC_FLAG_PATH, request.url);
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
      },
      cache: "no-store",
    });
    if (!response.ok) return { enabled: false, fetchFailed: true };
    const payload = await response.json().catch(() => null);
    if (typeof payload?.enabled !== "boolean") {
      return { enabled: false, fetchFailed: true };
    }
    return { enabled: payload.enabled === true, fetchFailed: false };
  } catch {
    return { enabled: false, fetchFailed: true };
  }
}

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

async function resolveSupportModeState({ supabase, request, shouldLogRole, pathname }) {
  const sessionId = (request.cookies.get(IMPERSONATE_SESSION_COOKIE)?.value || "").trim();
  const targetUserId = (request.cookies.get(IMPERSONATE_USER_COOKIE)?.value || "").trim();
  const cookieTargetRole = (
    request.cookies.get(IMPERSONATE_TARGET_ROLE_COOKIE)?.value || ""
  )
    .trim()
    .toLowerCase();

  if (!isUuid(sessionId) || !isUuid(targetUserId)) {
    return {
      supportModeActive: false,
      targetRole: null,
      targetUserId: null,
      reason: "missing_or_invalid_cookies",
    };
  }

  const { data, error } = await supabase.rpc("get_impersonation_session", {
    p_session_id: sessionId,
  });
  if (error) {
    if (shouldLogRole) {
      console.warn("[AUTH_GUARD_DIAG] middleware:support_mode:rpc_error", {
        pathname,
        code: error.code || null,
        message: error.message || null,
      });
    }
    return {
      supportModeActive: false,
      targetRole: null,
      targetUserId: null,
      reason: "rpc_error",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const sessionTargetUserId = String(row?.target_user_id || "").trim();
  const sessionTargetRole = String(row?.target_role || "").trim().toLowerCase();
  const sessionActive = row?.is_active === true;

  if (!row || !sessionActive || sessionTargetUserId !== targetUserId) {
    return {
      supportModeActive: false,
      targetRole: null,
      targetUserId: null,
      reason: "session_invalid_or_mismatch",
    };
  }

  const targetRole =
    sessionTargetRole === "customer" || sessionTargetRole === "business"
      ? sessionTargetRole
      : cookieTargetRole === "customer" || cookieTargetRole === "business"
        ? cookieTargetRole
        : null;

  if (!targetRole) {
    return {
      supportModeActive: false,
      targetRole: null,
      targetUserId: null,
      reason: "missing_target_role",
    };
  }

  return {
    supportModeActive: true,
    targetRole,
    targetUserId,
    reason: "ok",
  };
}

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;
  const isNearbyRoute = isCustomerNearbyPath(pathname);
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/_vercel/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const mode = (request.headers.get("sec-fetch-mode") || "").toLowerCase();
  const dest = (request.headers.get("sec-fetch-dest") || "").toLowerCase();
  const fetchUser = request.headers.get("sec-fetch-user");
  const isDocumentNavigation =
    mode === "navigate" || dest === "document" || fetchUser === "?1";
  const invokeQuery = request.headers.get("x-invoke-query") || "";
  const nextUrlHeader = request.headers.get("next-url") || "";
  const nextUrlString = request.nextUrl.toString();
  const isRscQuery =
    request.nextUrl.searchParams.has("_rsc") ||
    request.url.includes("_rsc=") ||
    invokeQuery.includes("_rsc=") ||
    nextUrlHeader.includes("_rsc=") ||
    nextUrlString.includes("_rsc=");
  const canRedirect = isDocumentNavigation && !isRscQuery;
  const isBusinessLandingRoute = pathname === "/business" || pathname === "/business/";
  const isDebugRsc = process.env.DEBUG_RSC === "1";
  const businessLandingGuardMeta = {
    hit: false,
    role: "unknown",
    destination: "pass",
  };
  const requestHeaders = new Headers(request.headers);
  const shouldSetFlightHeaders =
    request.method === "GET" &&
    !isDocumentNavigation &&
    !pathname.startsWith("/api/") &&
    !pathname.startsWith("/_next/") &&
    !pathname.startsWith("/_vercel/") &&
    pathname !== "/favicon.ico";
  if (isRscQuery || shouldSetFlightHeaders) {
    requestHeaders.set("rsc", "1");
    if (!requestHeaders.has("next-router-state-tree")) {
      requestHeaders.set(
        "next-router-state-tree",
        '["",{"children":["__PAGE__",{}]},null,null,true]'
      );
    }
  }
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  const isProd = process.env.NODE_ENV === "production";
  const cookieBaseOptions = getCookieBaseOptions({
    host: request.headers.get("host"),
    isProd,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              ...cookieBaseOptions,
            });
          });
        },
      },
    }
  );

  const attachDebugHeaders = (targetResponse, { redirectSuppressed = false } = {}) => {
    if (!isDebugRsc) return targetResponse;
    targetResponse.headers.set("x-yb-nav", canRedirect ? "1" : "0");
    targetResponse.headers.set(
      "x-yb-redirect-suppressed",
      redirectSuppressed ? "1" : "0"
    );
    return targetResponse;
  };

  const withSupabaseCookies = (targetResponse = response, options = {}) => {
    const cookies = response.cookies.getAll();
    cookies.forEach(({ name, value }) => {
      targetResponse.cookies.set(name, value);
    });
    if (process.env.NODE_ENV !== "production" && isBusinessLandingRoute) {
      targetResponse.headers.set(
        "x-yb-business-landing-guard",
        businessLandingGuardMeta.hit ? "middleware-hit" : "none"
      );
      targetResponse.headers.set(
        "x-yb-business-landing-role",
        businessLandingGuardMeta.role
      );
      targetResponse.headers.set(
        "x-yb-business-landing-destination",
        businessLandingGuardMeta.destination
      );
    }
    return attachDebugHeaders(targetResponse, options);
  };
  const withNearbyHeaders = (
    targetResponse,
    {
      enabled = false,
      decision = "restrict",
      flagFetchFailed = false,
      nearbyCookie = null,
    } = {}
  ) => {
    if (!isNearbyRoute) return targetResponse;
    targetResponse.headers.set("x-nearby-mw", "hit");
    targetResponse.headers.set("x-nearby-public-enabled", enabled ? "1" : "0");
    targetResponse.headers.set("x-nearby-public-decision", decision);
    if (nearbyCookie) {
      targetResponse.headers.set("x-nearby-cookie", nearbyCookie);
    }
    if (flagFetchFailed) {
      targetResponse.headers.set("x-nearby-flag-fetch", "fail");
    }
    return targetResponse;
  };
  const setNearbyPublicCookie = (targetResponse) => {
    targetResponse.cookies.set(NEARBY_PUBLIC_COOKIE_NAME, "1", {
      path: "/customer/nearby",
      maxAge: 120,
      sameSite: "lax",
      secure: isProd,
    });
    return targetResponse;
  };
  const clearNearbyPublicCookie = (targetResponse) => {
    targetResponse.cookies.set(NEARBY_PUBLIC_COOKIE_NAME, "", {
      path: "/customer/nearby",
      maxAge: 0,
      sameSite: "lax",
      secure: isProd,
    });
    return targetResponse;
  };

  const redirectSafely = (targetPath) => {
    if (!targetPath || targetPath === pathname || !canRedirect) {
      logMiddlewareAuthTrace(request, {
        middlewareCanReadUser: Boolean(user?.id),
        userId: user?.id || null,
        role,
        redirectDestination: null,
        redirectReason: !canRedirect ? "redirect_suppressed_non_document_or_rsc" : "no_redirect",
      });
      return withSupabaseCookies(response);
    }
    if (process.env.NODE_ENV !== "production") {
      if (targetPath === "/" && pathname.startsWith("/onboarding")) {
        console.info("[ONBOARDING_REDIRECT_TRACE] source=middleware_redirectSafely", {
          from: pathname,
          to: targetPath,
          role,
        });
      }
      console.info("[AUTH_MW_REDIRECT]", {
        from: pathname,
        to: targetPath,
      });
    }
    logMiddlewareAuthTrace(request, {
      middlewareCanReadUser: Boolean(user?.id),
      userId: user?.id || null,
      role,
      redirectDestination: targetPath,
      redirectReason: "redirect_safely",
    });
    return withSupabaseCookies(NextResponse.redirect(new URL(targetPath, request.url)));
  };

  // Redirect chokepoint: suppress redirects for non-document and _rsc requests,
  // except /business where we enforce early business landing redirects.
  if (!canRedirect && !isBusinessLandingRoute) {
    logMiddlewareAuthTrace(request, {
      middlewareCanReadUser: false,
      userId: null,
      role: null,
      redirectDestination: null,
      redirectReason: "redirect_suppressed_non_document_or_rsc",
    });
    return withSupabaseCookies(response, { redirectSuppressed: true });
  }

  const isBusinessMarketingRoute =
    pathname === "/business" ||
    pathname === "/business/" ||
    pathname.startsWith("/business/about") ||
    pathname.startsWith("/business/pricing") ||
    pathname.startsWith("/business/faq") ||
    pathname.startsWith("/business/how-it-works") ||
    pathname.startsWith("/business/retailers");

  const isBusinessAuthRoute =
    pathname.startsWith("/business/login") ||
    pathname.startsWith("/business/signup") ||
    pathname.startsWith("/business/register");

  const isBusinessOnboardingRoute =
    pathname === "/business/onboarding" || pathname.startsWith("/business/onboarding/");
  const isCanonicalOnboardingRoute =
    pathname === "/onboarding" || pathname.startsWith("/onboarding/");

  const isBusinessAppRoute =
    pathname.startsWith("/business/") &&
    !isBusinessMarketingRoute &&
    !isBusinessAuthRoute &&
    !isBusinessOnboardingRoute;

  const shouldLogRole =
    process.env.NODE_ENV !== "production" &&
    (process.env.AUTH_GUARD_DIAG === "1" || process.env.NEXT_PUBLIC_AUTH_DIAG === "1");
  const { user, role } = await resolveCurrentUserRoleFromClient(supabase, {
    log: shouldLogRole,
  });

  if (pathname.startsWith("/business-auth/")) {
    let businessRowFound = null;
    let passwordSetState = null;
    if (user?.id) {
      const [{ data: businessStateRow }, { data: businessRow }] = await Promise.all([
        supabase
          .from("users")
          .select("password_set")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("businesses")
          .select("owner_user_id")
          .eq("owner_user_id", user.id)
          .maybeSingle(),
      ]);
      passwordSetState = businessStateRow?.password_set === true;
      businessRowFound = Boolean(businessRow?.owner_user_id);
    }
    logBusinessRedirectTrace("middleware_business_auth", {
      host: request.headers.get("host") || request.nextUrl.host,
      pathname,
      authCookieNames: getBusinessAuthCookieNames(request.cookies.getAll()),
      requestIncludesAuthCookies:
        getBusinessAuthCookieNames(request.cookies.getAll()).length > 0,
      userPresent: Boolean(user?.id),
      role,
      businessRowFound,
      password_set: passwordSetState,
      redirectDestination: null,
      redirectReason: "business_auth_passthrough",
    });
    logMiddlewareAuthTrace(request, {
      middlewareCanReadUser: Boolean(user?.id),
      userId: user?.id || null,
      role,
      redirectDestination: null,
      redirectReason: "business_auth_passthrough",
    });
    return withSupabaseCookies(response);
  }

  logMiddlewareAuthTrace(request, {
    middlewareCanReadUser: Boolean(user?.id),
    userId: user?.id || null,
    role,
    redirectDestination: null,
    redirectReason: "resolved_identity",
  });
  let accountStatus = null;
  let passwordSet = false;

  if (isBusinessLandingRoute && user?.id && role === "business") {
    const { data: businessUserRow } = await supabase
      .from("users")
      .select("account_status,password_set")
      .eq("id", user.id)
      .maybeSingle();
    accountStatus = normalizeAccountStatus(businessUserRow?.account_status);
    passwordSet = businessUserRow?.password_set === true;

    if (!passwordSet) {
      businessLandingGuardMeta.hit = true;
      businessLandingGuardMeta.role = "business";
      businessLandingGuardMeta.destination = BUSINESS_CREATE_PASSWORD_PATH;
      logBusinessRedirectTrace("middleware_business_landing", {
        pathname,
        userPresent: true,
        role,
        businessRowFound: null,
        sessionExists: true,
        password_set: passwordSet,
        onboardingState: null,
        redirectDestination: BUSINESS_CREATE_PASSWORD_PATH,
        redirectReason: "business_landing_password_setup_required",
        accountStatus,
      });
      logMiddlewareAuthTrace(request, {
        middlewareCanReadUser: true,
        userId: user.id,
        role,
        redirectDestination: BUSINESS_CREATE_PASSWORD_PATH,
        redirectReason: "business_landing_password_setup_required",
      });
      return withSupabaseCookies(
        NextResponse.redirect(new URL(BUSINESS_CREATE_PASSWORD_PATH, request.url), 307)
      );
    }

    businessLandingGuardMeta.hit = true;
    businessLandingGuardMeta.role = "business";
    const { data: businessRow } = await supabase
      .from("businesses")
      .select("business_name,category,address,city,state,postal_code")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (!isBusinessOnboardingComplete(businessRow)) {
      businessLandingGuardMeta.destination = "/onboarding";
      logBusinessRedirectTrace("middleware_business_landing", {
        pathname,
        userPresent: true,
        role,
        businessRowFound: Boolean(businessRow?.owner_user_id),
        sessionExists: true,
        password_set: passwordSet,
        onboardingState: false,
        redirectDestination: "/onboarding",
        redirectReason: "business_landing_onboarding_required",
        accountStatus,
      });
      logMiddlewareAuthTrace(request, {
        middlewareCanReadUser: true,
        userId: user.id,
        role,
        redirectDestination: "/onboarding",
        redirectReason: "business_landing_onboarding_required",
      });
      return withSupabaseCookies(
        NextResponse.redirect(new URL("/onboarding", request.url), 307)
      );
    }

    businessLandingGuardMeta.destination = "/business/dashboard";
    logBusinessRedirectTrace("middleware_business_landing", {
      pathname,
      userPresent: true,
      role,
      businessRowFound: Boolean(businessRow?.owner_user_id),
      sessionExists: true,
      password_set: passwordSet,
      onboardingState: true,
      redirectDestination: "/business/dashboard",
      redirectReason: "business_landing_dashboard_ready",
      accountStatus,
    });
    logMiddlewareAuthTrace(request, {
      middlewareCanReadUser: true,
      userId: user.id,
      role,
      redirectDestination: "/business/dashboard",
      redirectReason: "business_landing_dashboard_ready",
    });
    return withSupabaseCookies(
      NextResponse.redirect(new URL("/business/dashboard", request.url), 307)
    );
  }

  if (isBusinessLandingRoute) {
    businessLandingGuardMeta.hit = true;
    businessLandingGuardMeta.role = role || "anon";
  }

  const supportMode = user?.id
    ? await resolveSupportModeState({
        supabase,
        request,
        shouldLogRole,
        pathname,
      })
    : {
        supportModeActive: false,
        targetRole: null,
        targetUserId: null,
        reason: "no_user",
      };

  if (shouldLogRole) {
    console.warn("[AUTH_GUARD_DIAG] middleware:effective_identity", {
      pathname,
      actorUserId: user?.id || null,
      actorRole: role,
      supportModeActive: supportMode.supportModeActive,
      targetUserId: supportMode.targetUserId,
      effectiveRole: supportMode.supportModeActive ? supportMode.targetRole : role,
      supportReason: supportMode.reason,
    });
  }

  if (
    pathname.startsWith("/api/auth/callback") ||
    pathname.startsWith("/oauth/callback") ||
    pathname.startsWith("/signin") ||
    pathname.startsWith("/auth")
  ) {
    return withSupabaseCookies(response);
  }

  if (user?.id) {
    if (accountStatus === null) {
      const { data: lifecycleRow } = await supabase
        .from("users")
        .select("account_status,password_set")
        .eq("id", user.id)
        .maybeSingle();
      accountStatus = normalizeAccountStatus(lifecycleRow?.account_status);
      passwordSet = lifecycleRow?.password_set === true;
    }
    if (isBlockedAccountStatus(accountStatus)) {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // best effort
      }
      const deletedPath = getAccountDeletedRedirectPath();
      if (pathname !== deletedPath) {
        return withSupabaseCookies(
          NextResponse.redirect(new URL(deletedPath, request.url), 307)
        );
      }
    }
  }

  if (isBusinessMarketingRoute || isBusinessAuthRoute) {
    return withSupabaseCookies(response);
  }

  if (isBusinessOnboardingRoute) {
    return withSupabaseCookies(
      NextResponse.redirect(new URL("/onboarding", request.url), 307)
    );
  }

  if (pathname.startsWith("/admin")) {
    if (!user) {
      const signinUrl = new URL("/signin", request.url);
      signinUrl.searchParams.set("modal", "signin");
      signinUrl.searchParams.set("next", pathname);
      if (process.env.NODE_ENV !== "production") {
        console.info("[AUTH_MW_REDIRECT]", {
          from: pathname,
          to: `${signinUrl.pathname}${signinUrl.search}`,
          reason: "admin_requires_auth",
          role,
        });
      }
      return withSupabaseCookies(NextResponse.redirect(signinUrl));
    }
    if (role !== "admin") {
      if (process.env.NODE_ENV !== "production") {
        console.info("[AUTH_MW_REDIRECT]", {
          from: pathname,
          to: getRoleLandingPath(role),
          reason: "admin_requires_admin_role",
          role,
        });
      }
      return redirectSafely(getRoleLandingPath(role));
    }
    return withSupabaseCookies(response);
  }

  if (pathname.startsWith("/customer")) {
    if (isNearbyRoute) {
      const nearbyFlag = await fetchCustomerNearbyPublicFlag(request);
      if (!user && nearbyFlag.enabled) {
        const redirectedUrl = request.nextUrl.clone();
        redirectedUrl.pathname = redirectedUrl.pathname.replace(
          /^\/customer\/nearby/,
          "/nearby"
        );
        const redirectedResponse = NextResponse.redirect(redirectedUrl, 307);
        return withNearbyHeaders(
          setNearbyPublicCookie(withSupabaseCookies(redirectedResponse)),
          {
          enabled: true,
          decision: "allow",
          flagFetchFailed: nearbyFlag.fetchFailed,
            nearbyCookie: "set",
          }
        );
      }

      if (!user) {
        const signinUrl = new URL("/signin", request.url);
        signinUrl.searchParams.set("modal", "signin");
        signinUrl.searchParams.set("next", pathname);
        return withNearbyHeaders(
          clearNearbyPublicCookie(withSupabaseCookies(NextResponse.redirect(signinUrl))),
          {
            enabled: nearbyFlag.enabled,
            decision: "restrict",
            flagFetchFailed: nearbyFlag.fetchFailed,
            nearbyCookie: "cleared",
          }
        );
      }

      if (role !== "customer") {
        if (role === "business") {
          return withNearbyHeaders(
            clearNearbyPublicCookie(withSupabaseCookies(
              NextResponse.redirect(new URL("/business/dashboard", request.url))
            )),
            {
              enabled: nearbyFlag.enabled,
              decision: "restrict",
              flagFetchFailed: nearbyFlag.fetchFailed,
              nearbyCookie: "cleared",
            }
          );
        }
        if (role === "admin") {
          if (supportMode.supportModeActive && supportMode.targetRole === "customer") {
            return withNearbyHeaders(withSupabaseCookies(response), {
              enabled: nearbyFlag.enabled,
              decision: "allow",
              flagFetchFailed: nearbyFlag.fetchFailed,
            });
          }
          return withNearbyHeaders(
            clearNearbyPublicCookie(
              withSupabaseCookies(NextResponse.redirect(new URL("/admin", request.url)))
            ),
            {
              enabled: nearbyFlag.enabled,
              decision: "restrict",
              flagFetchFailed: nearbyFlag.fetchFailed,
              nearbyCookie: "cleared",
            }
          );
        }
        return withNearbyHeaders(
          clearNearbyPublicCookie(
            withSupabaseCookies(new NextResponse("Forbidden", { status: 403 }))
          ),
          {
            enabled: nearbyFlag.enabled,
            decision: "restrict",
            flagFetchFailed: nearbyFlag.fetchFailed,
            nearbyCookie: "cleared",
          }
        );
      }

      return withNearbyHeaders(withSupabaseCookies(response), {
        enabled: nearbyFlag.enabled,
        decision: "allow",
        flagFetchFailed: nearbyFlag.fetchFailed,
      });
    }

    if (!user) {
      const signinUrl = new URL("/signin", request.url);
      signinUrl.searchParams.set("modal", "signin");
      signinUrl.searchParams.set("next", pathname);
      return withSupabaseCookies(NextResponse.redirect(signinUrl));
    }
    if (role !== "customer") {
      if (role === "business") {
        return withSupabaseCookies(
          NextResponse.redirect(new URL("/business/dashboard", request.url))
        );
      }
      if (role === "admin") {
        if (supportMode.supportModeActive && supportMode.targetRole === "customer") {
          return withSupabaseCookies(response);
        }
        return withSupabaseCookies(NextResponse.redirect(new URL("/admin", request.url)));
      }
      return withSupabaseCookies(new NextResponse("Forbidden", { status: 403 }));
    }
    return withSupabaseCookies(response);
  }

  if (isCanonicalOnboardingRoute) {
    if (!user?.id) {
      return redirectSafely(
        `/business-auth/login?next=${encodeURIComponent("/onboarding")}`
      );
    }

    // Onboarding is a bootstrap route. Users may not be "business" yet.
    if (supportMode.supportModeActive) {
      return withSupabaseCookies(response);
    }

    if (role === "business" && !passwordSet) {
      return redirectSafely(BUSINESS_CREATE_PASSWORD_PATH);
    }

    // Do NOT restrict /onboarding by role; onboarding flow flips role as needed.
    return withSupabaseCookies(response);
  }

  if (isBusinessAppRoute) {
    if (!user?.id) {
      return redirectSafely(
        `/business-auth/login?next=${encodeURIComponent(pathname)}`
      );
    }

    if (supportMode.supportModeActive) {
      return withSupabaseCookies(response);
    }

    if (role !== "business") {
      return redirectSafely("/");
    }

    if (!passwordSet) {
      return redirectSafely(BUSINESS_CREATE_PASSWORD_PATH);
    }

    const { data: businessRow, error: businessError } = await supabase
      .from("businesses")
      .select("owner_user_id,business_name,category,address,city,state,postal_code")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    const hasBusiness = !businessError && Boolean(businessRow?.owner_user_id);
    const onboardingComplete = hasBusiness && isBusinessOnboardingComplete(businessRow);

    if (!hasBusiness || !onboardingComplete) {
      return redirectSafely("/onboarding");
    }

    return withSupabaseCookies(response);
  }

  return withSupabaseCookies(response);
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/customer/:path*",
    "/business/:path*",
    "/business-auth/:path*",
    "/onboarding/:path*",
    "/business/onboarding/:path*",
    { source: "/:path*", has: [{ type: "query", key: "_rsc" }] },
  ],
};
