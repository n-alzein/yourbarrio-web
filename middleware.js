import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getCookieBaseOptions } from "@/lib/authCookies";
import { resolveCurrentUserRoleFromClient } from "@/lib/auth/getCurrentUserRole";

const IMPERSONATE_USER_COOKIE = "yb_impersonate_user_id";
const IMPERSONATE_SESSION_COOKIE = "yb_impersonate_session_id";
const IMPERSONATE_TARGET_ROLE_COOKIE = "yb_impersonate_target_role";

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
  const isDebugRsc = process.env.DEBUG_RSC === "1";
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
    return attachDebugHeaders(targetResponse, options);
  };

  const redirectSafely = (targetPath) => {
    if (!targetPath || targetPath === pathname || !canRedirect) {
      return withSupabaseCookies(response);
    }
    return withSupabaseCookies(NextResponse.redirect(new URL(targetPath, request.url)));
  };

  // Redirect chokepoint: suppress redirects for non-document and _rsc requests.
  if (!canRedirect) {
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
    pathname.startsWith("/signin") ||
    pathname.startsWith("/auth")
  ) {
    return withSupabaseCookies(response);
  }

  if (isBusinessMarketingRoute || isBusinessAuthRoute) {
    return withSupabaseCookies(response);
  }

  if (isBusinessOnboardingRoute) {
    return redirectSafely("/onboarding");
  }

  if (pathname.startsWith("/admin")) {
    if (!user || role !== "admin") {
      return withSupabaseCookies(new NextResponse("Not Found", { status: 404 }));
    }
    return withSupabaseCookies(response);
  }

  if (pathname.startsWith("/customer")) {
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
        `/signin?modal=signin&next=${encodeURIComponent(pathname)}`
      );
    }

    const effectiveRole = supportMode.supportModeActive ? supportMode.targetRole : role;
    if (effectiveRole !== "business") {
      if (effectiveRole === "customer") return redirectSafely("/customer/home");
      if (effectiveRole === "admin") return redirectSafely("/admin");
      return withSupabaseCookies(new NextResponse("Forbidden", { status: 403 }));
    }

    return withSupabaseCookies(response);
  }

  if (isBusinessAppRoute) {
    if (!user?.id) {
      return redirectSafely(
        `/signin?modal=signin&next=${encodeURIComponent(pathname)}`
      );
    }

    if (supportMode.supportModeActive) {
      return withSupabaseCookies(response);
    }

    if (role !== "business") {
      if (role === "customer") return redirectSafely("/customer/home");
      if (role === "admin") return redirectSafely("/admin");
      return withSupabaseCookies(new NextResponse("Forbidden", { status: 403 }));
    }

    const { data: businessRow, error: businessError } = await supabase
      .from("businesses")
      .select("owner_user_id")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    const hasBusiness = !businessError && Boolean(businessRow?.owner_user_id);

    if (!hasBusiness) {
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
    "/onboarding/:path*",
    { source: "/:path*", has: [{ type: "query", key: "_rsc" }] },
  ],
};
