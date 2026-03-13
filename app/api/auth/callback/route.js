"use server";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { normalizeAppRole } from "@/lib/auth/redirects";
import { getCookieBaseOptions } from "@/lib/authCookies";
import { ensureBusinessProvisionedForUser } from "@/lib/auth/ensureBusinessProvisioning";
import {
  getBusinessPasswordGateState,
  getBusinessRedirectDestination,
} from "@/lib/auth/businessPasswordGate";
import {
  isBlockedAccountStatus,
  normalizeAccountStatus,
} from "@/lib/accountDeletion/status";

const AUTH_CALLBACK_HANDLER_MARKER = "app/api/auth/callback/route.js";

function classifyAuthCallbackError(err) {
  const msg = String(err?.message || "").toLowerCase();
  const code = String(err?.code || "").toLowerCase();

  const isOtpOrCodeContext =
    msg.includes("code") ||
    msg.includes("otp") ||
    msg.includes("token") ||
    msg.includes("authorization");

  const isExpiredOrInvalid =
    msg.includes("expired") ||
    msg.includes("invalid") ||
    code.includes("expired") ||
    code.includes("invalid");

  if (isOtpOrCodeContext && isExpiredOrInvalid) return "magic_link_expired";
  return "auth_callback_failed";
}

const OTP_TYPES = new Set([
  "email",
  "magiclink",
  "recovery",
  "invite",
  "email_change",
]);

function normalizeOtpType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "magiclink") return "email";
  if (OTP_TYPES.has(normalized)) return normalized;
  return "email";
}

function normalizeNextPath(input) {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  let path = trimmed;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const u = new URL(trimmed);
      path = `${u.pathname}${u.search || ""}`;
    }
  } catch {
    // Ignore parse failures; continue with raw value.
  }

  if (!path.startsWith("/")) return null;
  if (path.startsWith("//")) return null;

  if (path === "/business/onboarding" || path.startsWith("/business/onboarding/")) {
    path = path.replace(/^\/business\/onboarding/, "/onboarding");
  }

  return path;
}

function isSafeInternalPath(path) {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//");
}

function isAllowedNextPath(value) {
  if (!isSafeInternalPath(value)) return false;
  const path = value.trim();
  return (
    path === "/" ||
    path === "/onboarding" ||
    path.startsWith("/onboarding/") ||
    path === "/business" ||
    path.startsWith("/business/") ||
    path.startsWith("/customer/") ||
    path.startsWith("/go/") ||
    path.startsWith("/admin/") ||
    path.startsWith("/signin") ||
    path.startsWith("/auth/")
  );
}

function isBusinessIntentPath(path) {
  if (typeof path !== "string") return false;
  const normalized = path.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized === "/onboarding" ||
    normalized.startsWith("/onboarding/") ||
    normalized.includes("onboarding") ||
    normalized.includes("business")
  );
}

async function ensureBusinessProvisioned({ user, debug }) {
  await ensureBusinessProvisionedForUser({
    userId: user?.id,
    email: user?.email || "",
    debug,
    source: "api_auth_callback",
  });
}

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const debug = requestUrl.searchParams.get("debug") === "1";
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const tokenType = normalizeOtpType(requestUrl.searchParams.get("type"));
  const accessToken = requestUrl.searchParams.get("access_token");
  const refreshToken = requestUrl.searchParams.get("refresh_token");
  const callbackError = requestUrl.searchParams.get("error");
  const callbackErrorCode = requestUrl.searchParams.get("error_code");
  const authDiagEnabled = process.env.NEXT_PUBLIC_AUTH_DIAG === "1";
  const cookieStore = await cookies();
  const isProd = process.env.NODE_ENV === "production";
  const cookieBaseOptions = getCookieBaseOptions({
    host: request.headers.get("host"),
    isProd,
  });
  const cookiesSetDuringAuth = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            const mergedOptions = {
              ...options,
              ...cookieBaseOptions,
            };
            cookiesSetDuringAuth.push({ name, value, options: mergedOptions });
            cookieStore.set(name, value, mergedOptions);
          });
        },
      },
    }
  );
  const rawNext = requestUrl.searchParams.get("next");
  const nextNormalized = normalizeNextPath(rawNext);
  const nextSafe = Boolean(nextNormalized);
  const nextAllowed =
    nextSafe && isSafeInternalPath(nextNormalized) && isAllowedNextPath(nextNormalized);
  const safeNext = nextAllowed ? nextNormalized : null;
  const businessIntent =
    isBusinessIntentPath(safeNext) || isBusinessIntentPath(rawNext || nextNormalized || "");

  const attachSupabaseCookies = (targetResponse) => {
    const sbCookieMap = new Map();

    cookiesSetDuringAuth.forEach(({ name, value, options }) => {
      sbCookieMap.set(name, { value, options });
    });

    cookieStore
      .getAll()
      .filter((cookie) => cookie?.name?.startsWith("sb-"))
      .forEach((cookie) => {
        if (!sbCookieMap.has(cookie.name)) {
          sbCookieMap.set(cookie.name, {
            value: cookie.value,
            options: cookieBaseOptions,
          });
        }
      });

    sbCookieMap.forEach(({ value, options }, name) => {
      targetResponse.cookies.set(name, value, options);
    });

    return {
      response: targetResponse,
      hasSupabaseCookies: sbCookieMap.size > 0,
    };
  };

  const buildRedirectResponse = ({ destination, role, reason }) => {
    const chosenDestination = destination || "/onboarding";
    const { response: redirectResponse, hasSupabaseCookies } = attachSupabaseCookies(
      NextResponse.redirect(new URL(chosenDestination, request.url), 303)
    );
    redirectResponse.headers.set("x-auth-callback-handler", AUTH_CALLBACK_HANDLER_MARKER);
    redirectResponse.headers.set("x-auth-callback-destination", chosenDestination);
    redirectResponse.headers.set(
      "x-auth-callback-has-cookies",
      hasSupabaseCookies ? "1" : "0"
    );
    if (debug || process.env.NODE_ENV !== "production") {
      console.warn(
        "[AUTH_CALLBACK_TRACE] destination",
        chosenDestination,
        "rawNext",
        rawNext,
        "reason",
        reason || null
      );
      redirectResponse.headers.set("X-YB-Auth-NextRaw", rawNext ?? "");
      redirectResponse.headers.set("X-YB-Auth-NextChosen", chosenDestination);
      redirectResponse.headers.set("X-YB-Auth-Role", role ?? "");
    }
    return redirectResponse;
  };

  const buildLoginRedirectResponse = ({ reason, authError = "invalid_link" }) => {
    const destination = businessIntent ? "/business-auth/login" : "/signin";
    const fallbackNext = safeNext || (businessIntent ? "/onboarding" : "/");
    const redirectUrl = new URL(destination, request.url);
    if (!businessIntent) {
      redirectUrl.searchParams.set("modal", "signin");
    }
    redirectUrl.searchParams.set("next", fallbackNext);
    if (authError) {
      redirectUrl.searchParams.set("auth", authError);
    }

    const { response: redirectResponse, hasSupabaseCookies } = attachSupabaseCookies(
      NextResponse.redirect(redirectUrl, 303)
    );
    redirectResponse.headers.set("x-auth-callback-handler", AUTH_CALLBACK_HANDLER_MARKER);
    redirectResponse.headers.set(
      "x-auth-callback-has-cookies",
      hasSupabaseCookies ? "1" : "0"
    );
    redirectResponse.headers.set(
      "x-auth-callback-destination",
      `${redirectUrl.pathname}${redirectUrl.search}`
    );
    if (debug || process.env.NODE_ENV !== "production") {
      console.warn("[AUTH_CALLBACK_TRACE] fallback_redirect", {
        reason: reason || null,
        authError,
        businessIntent,
        rawNext,
        safeNext: fallbackNext,
        destination: `${redirectUrl.pathname}${redirectUrl.search}`,
      });
    }
    return redirectResponse;
  };

  try {
    const hasAuthPayload = Boolean(code || tokenHash || (accessToken && refreshToken));
    if (process.env.NODE_ENV !== "production") {
      console.info("[AUTH_CALLBACK_TRACE] callback_params", {
        hasCode: Boolean(code),
        hasTokenHash: Boolean(tokenHash),
        tokenType,
        hasAccessToken: Boolean(accessToken),
        hasRefreshToken: Boolean(refreshToken),
        hasError: Boolean(callbackError),
        errorCode: callbackErrorCode || null,
      });
      if (!hasAuthPayload) {
        console.warn("[AUTH_CALLBACK_TRACE] unsupported_no_auth_payload", {
          reason: "cannot_establish_magic_link_session_without_payload",
          rawNext,
        });
      }
    }

    if (code) {
      if (authDiagEnabled) {
        console.log("[AUTH_DIAG]", {
          timestamp: new Date().toISOString(),
          pathname: requestUrl.pathname,
          label: "auth:exchangeCodeForSession",
          stack: new Error().stack,
        });
      }
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        const reason = classifyAuthCallbackError(exchangeError);
        return buildLoginRedirectResponse({
          reason: "exchange_failed",
          authError: reason,
        });
      }
    } else if (tokenHash) {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: tokenType,
      });
      if (verifyError) {
        const reason = classifyAuthCallbackError(verifyError);
        if (process.env.NODE_ENV !== "production") {
          console.warn("[AUTH_CALLBACK_TRACE] verify_failed", {
            reason,
            code: verifyError.code || null,
            message: verifyError.message || null,
            tokenType,
            rawNext,
            safeNext,
          });
        }
        return buildLoginRedirectResponse({
          reason: "verify_failed",
          authError: reason,
        });
      }
    } else if (accessToken && refreshToken) {
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (setSessionError) {
        const reason = classifyAuthCallbackError(setSessionError);
        if (process.env.NODE_ENV !== "production") {
          console.warn("[AUTH_CALLBACK_TRACE] set_session_failed", {
            reason,
            code: setSessionError.code || null,
            message: setSessionError.message || null,
            rawNext,
            safeNext,
          });
        }
        return buildLoginRedirectResponse({
          reason: "set_session_failed",
          authError: reason,
        });
      }
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return buildLoginRedirectResponse({
        reason: "no_user_after_callback",
        authError: callbackError ? "invalid_link" : "session_missing",
      });
    }

    if (businessIntent) {
      try {
        if (debug || process.env.NODE_ENV !== "production") {
          console.warn("[AUTH_REDIRECT_TRACE] business_provisioning:start", {
            userId: user.id,
            safeNext,
          });
        }
        await ensureBusinessProvisioned({ user, debug });
      } catch (provisionError) {
        console.warn("[AUTH_REDIRECT_TRACE] business_provisioning:failed", {
          userId: user.id,
          safeNext,
          error: provisionError?.message || String(provisionError),
        });
        return buildRedirectResponse({
          destination: "/business-auth/register?error=provisioning_failed",
          role: "",
          reason: "business_provisioning_failed",
        });
      }
    }

    const businessGate = await getBusinessPasswordGateState({
      supabase,
      userId: user.id,
      fallbackRole: normalizeAppRole(user?.app_metadata?.role),
    });

    const resolvedRole = businessGate.role;
    const accountStatus = normalizeAccountStatus(businessGate.accountStatus);

    if (isBlockedAccountStatus(accountStatus)) {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // best effort
      }
      return buildLoginRedirectResponse({
        reason: "blocked_account_login",
        authError: "invalid_credentials",
      });
    }
    const destination =
      resolvedRole === "business"
        ? getBusinessRedirectDestination({
            passwordSet: businessGate.passwordSet,
            onboardingComplete: businessGate.onboardingComplete,
            safeNext,
          })
        : safeNext ?? "/onboarding";

    if (debug || process.env.NODE_ENV !== "production") {
      console.info("[AUTH_CALLBACK_TRACE]", {
        rawNext,
        normalizedNext: nextNormalized,
        safeNext,
        businessIntent,
        role: resolvedRole || null,
        destination,
        reason:
          resolvedRole === "business"
            ? "business_password_or_onboarding_gate"
            : safeNext
              ? "next_param"
              : "fallback_to_onboarding",
      });
      console.warn("[AUTH_REDIRECT_TRACE] auth_callback", {
        role: resolvedRole || null,
        passwordSet: businessGate.passwordSet,
        onboardingComplete: businessGate.onboardingComplete,
        nextRaw: rawNext,
        nextNormalized,
        nextRewritten: Boolean(rawNext) && nextNormalized !== rawNext,
        requestedPath: safeNext,
        nextRejectedByValidation: Boolean(rawNext) && !nextSafe,
        nextRejectedByAllowlist: nextSafe && !nextAllowed,
        chosenDestination: destination,
      });
    }
    if (debug) {
      console.warn("[AUTH_REDIRECT_TRACE] api_auth_callback", {
        nextRaw: rawNext,
        nextPath: safeNext,
        destination,
        role: resolvedRole || null,
      });
    }

    return buildRedirectResponse({
      destination,
      role: resolvedRole || "",
      reason:
        resolvedRole === "business"
          ? "business_password_or_onboarding_gate"
          : safeNext
            ? "next_param"
            : "fallback_to_onboarding",
    });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[AUTH_CALLBACK_TRACE] exception", {
        message: err?.message || String(err),
        rawNext,
      });
    }
    return buildLoginRedirectResponse({
      reason: "exception",
      authError: classifyAuthCallbackError(err),
    });
  }
}
