import { NextRequest, NextResponse } from "next/server";
import { getSafeRedirectPath } from "@/lib/auth/redirects";
import { ensureBusinessProvisionedForUser } from "@/lib/auth/ensureBusinessProvisioning";
import {
  BUSINESS_POST_CONFIRM_PATH,
  getBusinessPasswordGateState,
  getBusinessRedirectDestination,
  logBusinessRedirectTrace,
} from "@/lib/auth/businessPasswordGate";
import { createSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

const OTP_TYPES = new Set([
  "email",
  "signup",
  "magiclink",
  "recovery",
  "invite",
  "email_change",
]);

function normalizeOtpType(input: string) {
  const normalized = String(input || "").trim().toLowerCase();
  if (!normalized || normalized === "magiclink" || normalized === "signup") {
    return "email";
  }
  return OTP_TYPES.has(normalized) ? normalized : "";
}

function getTargetPath(requestUrl: URL) {
  const safeNext = getSafeRedirectPath(requestUrl.searchParams.get("next"));
  return safeNext || "/set-password";
}

function isBusinessIntentPath(path: string) {
  const normalized = String(path || "").trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized === "/onboarding" ||
    normalized.startsWith("/onboarding/") ||
    normalized.includes("onboarding") ||
    normalized.includes("business")
  );
}

function getFallbackPath(requestUrl: URL, targetPath: string, businessIntent: boolean) {
  if (businessIntent) {
    const fallbackNext = targetPath || "/onboarding";
    const login = new URL("/business-auth/login", requestUrl);
    login.searchParams.set("next", fallbackNext);
    login.searchParams.set("auth", "invalid_link");
    return `${login.pathname}${login.search}`;
  }
  return "/auth/forgot-password?error=invalid_or_expired_link";
}

function copyResponseCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });
  return target;
}

function getResponseCookieSnapshot(response: NextResponse) {
  const cookies = response.cookies.getAll();
  return {
    setCookieCount: cookies.length,
    setCookieNames: cookies.map((cookie) => cookie.name),
  };
}

function buildRedirectResponseWithCookies({
  request,
  cookieSource,
  destination,
  logPayload,
}: {
  request: NextRequest;
  cookieSource: NextResponse;
  destination: string;
  logPayload: Record<string, unknown>;
}) {
  const finalResponse = NextResponse.redirect(new URL(destination, request.url));
  copyResponseCookies(cookieSource, finalResponse);
  logBusinessRedirectTrace("auth_confirm_final_response", {
    ...logPayload,
    finalRedirectDestination: destination,
    ...getResponseCookieSnapshot(finalResponse),
  });
  return finalResponse;
}

async function tryRedirectAuthenticatedBusiness({
  supabase,
  request,
  targetPath,
  cookieSource,
}: {
  supabase: ReturnType<typeof createSupabaseRouteHandlerClient>;
  request: NextRequest;
  targetPath: string;
  cookieSource: NextResponse;
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) return null;

  try {
    await ensureBusinessProvisionedForUser({
      userId: user.id,
      email: user.email || "",
      source: "auth_confirm_repeat_click",
    });
  } catch {
    return null;
  }

  const businessGate = await getBusinessPasswordGateState({
    supabase,
    userId: user.id,
    fallbackRole: "business",
  });

  if (businessGate.role !== "business") return null;

  const destination = getBusinessRedirectDestination({
    passwordSet: businessGate.passwordSet,
    onboardingComplete: businessGate.onboardingComplete,
    safeNext: targetPath,
  });

  return buildRedirectResponseWithCookies({
    request,
    cookieSource,
    destination: BUSINESS_POST_CONFIRM_PATH,
    logPayload: {
      host: request.headers.get("host") || new URL(request.url).host,
      pathname: new URL(request.url).pathname,
      sessionExists: true,
      userExists: true,
      userId: user.id,
      password_set: businessGate.passwordSet,
      onboardingState: businessGate.onboardingComplete,
      resolvedBusinessDestination: destination,
      redirectReason: "verify_otp_failed_existing_session_reused",
    },
  });
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host") || requestUrl.host;
  const code = requestUrl.searchParams.get("code") || "";
  const targetPath = getTargetPath(requestUrl);
  const tokenHash = requestUrl.searchParams.get("token_hash") || "";
  const type = normalizeOtpType(requestUrl.searchParams.get("type") || "");
  const businessIntent = isBusinessIntentPath(targetPath);
  const fallbackPath = getFallbackPath(requestUrl, targetPath, businessIntent);
  logBusinessRedirectTrace("auth_confirm_enter", {
    host,
    pathname: requestUrl.pathname,
    query: {
      hasCode: Boolean(code),
      hasTokenHash: Boolean(tokenHash),
      type: type || null,
      next: targetPath,
    },
    redirectReason: "entered_confirm_route",
  });

  const response = NextResponse.redirect(new URL(fallbackPath, request.url));
  const supabase = createSupabaseRouteHandlerClient(request, response);
  let verificationMethod:
    | "exchangeCodeForSession"
    | "verifyOtp"
    | "invalid" = "invalid";
  let verificationSucceeded = false;
  let verificationSessionExists = false;
  let verificationUserExists = false;
  let verificationUserId = null;

  if (code) {
    verificationMethod = "exchangeCodeForSession";

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    verificationSessionExists = Boolean(data?.session);
    verificationUserExists = Boolean(data?.user?.id);
    verificationUserId = data?.user?.id || null;
    if (error) {
      logBusinessRedirectTrace("auth_confirm_exit", {
        host,
        pathname: requestUrl.pathname,
        verificationMethod,
        authMethodPath: verificationMethod,
        authCallReturnedError: true,
        verificationSucceeded: false,
        verificationSessionExists,
        verificationUserExists,
        verificationUserId,
        sessionExists: null,
        userExists: null,
        redirectDestination: fallbackPath,
        redirectReason: "exchange_code_failed",
        ...getResponseCookieSnapshot(response),
        errorCode: error.code || null,
        errorMessage: error.message || null,
      });
      return response;
    }
  } else if (tokenHash && type) {
    verificationMethod = "verifyOtp";

    const { data, error } = await supabase.auth.verifyOtp({
      type: type as "email" | "recovery" | "invite" | "email_change",
      token_hash: tokenHash,
    });
    verificationSessionExists = Boolean(data?.session);
    verificationUserExists = Boolean(data?.user?.id);
    verificationUserId = data?.user?.id || null;

    if (error) {
      if (businessIntent) {
        const authenticatedRedirect = await tryRedirectAuthenticatedBusiness({
          supabase,
          request,
          targetPath,
          cookieSource: response,
        });
        if (authenticatedRedirect) {
          return authenticatedRedirect;
        }
      }
      logBusinessRedirectTrace("auth_confirm_exit", {
        host,
        pathname: requestUrl.pathname,
        verificationMethod,
        authMethodPath: verificationMethod,
        authCallReturnedError: true,
        verificationSucceeded: false,
        verificationSessionExists,
        verificationUserExists,
        verificationUserId,
        sessionExists: null,
        userExists: null,
        redirectDestination: fallbackPath,
        redirectReason: "verify_otp_failed",
        ...getResponseCookieSnapshot(response),
        errorCode: error.code || null,
        errorMessage: error.message || null,
      });
      return response;
    }
  } else {
    logBusinessRedirectTrace("auth_confirm_exit", {
      host,
      pathname: requestUrl.pathname,
      verificationMethod,
      authMethodPath: verificationMethod,
      authCallReturnedError: false,
      verificationSucceeded: false,
      verificationSessionExists,
      verificationUserExists,
      verificationUserId,
      sessionExists: null,
      userExists: null,
      redirectDestination: fallbackPath,
      redirectReason: "missing_or_invalid_params",
      ...getResponseCookieSnapshot(response),
    });
    return response;
  }
  verificationSucceeded = true;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let destination = targetPath;

  if (businessIntent) {
    if (!user?.id) {
      logBusinessRedirectTrace("auth_confirm_exit", {
        host,
        pathname: requestUrl.pathname,
        verificationMethod,
        authMethodPath: verificationMethod,
        authCallReturnedError: false,
        verificationSucceeded,
        verificationSessionExists,
        verificationUserExists,
        verificationUserId,
        sessionExists: Boolean(session),
        userExists: false,
        redirectDestination: fallbackPath,
        redirectReason: "verify_succeeded_but_user_missing",
        ...getResponseCookieSnapshot(response),
      });
      return response;
    }
    try {
      await ensureBusinessProvisionedForUser({
        userId: user.id,
        email: user.email || "",
        source: "auth_confirm",
      });
    } catch (provisionError: any) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[AUTH_CALLBACK_TRACE] confirm_fallback", {
          reason: "business_provisioning_failed",
          destination: fallbackPath,
          message: provisionError?.message || String(provisionError),
          userId: user.id,
        });
      }
      return response;
    }

    const businessGate = await getBusinessPasswordGateState({
      supabase,
      userId: user.id,
      fallbackRole: "business",
    });
    const resolvedBusinessDestination = getBusinessRedirectDestination({
      passwordSet: businessGate.passwordSet,
      onboardingComplete: businessGate.onboardingComplete,
      safeNext: targetPath,
    });
    destination = BUSINESS_POST_CONFIRM_PATH;

    return buildRedirectResponseWithCookies({
      request,
      cookieSource: response,
      destination,
      logPayload: {
        host,
        pathname: requestUrl.pathname,
        verificationMethod,
        verificationSucceeded,
        verificationSessionExists,
        verificationUserExists,
        verificationUserId,
        sessionExists: Boolean(session),
        userExists: true,
        userId: user.id,
        password_set: businessGate.passwordSet,
        onboardingState: businessGate.onboardingComplete,
        resolvedBusinessDestination,
        redirectReason: "business_post_confirm_redirect",
      },
    });
  }

  return buildRedirectResponseWithCookies({
    request,
    cookieSource: response,
    destination,
    logPayload: {
      host,
      pathname: requestUrl.pathname,
      verificationMethod,
      verificationSucceeded,
      verificationSessionExists,
      verificationUserExists,
      verificationUserId,
      sessionExists: Boolean(session),
      userExists: Boolean(user?.id),
      userId: user?.id || null,
      redirectReason: "non_business_post_confirm_redirect",
    },
  });
}
