import { NextRequest, NextResponse } from "next/server";
import { getSafeRedirectPath } from "@/lib/auth/redirects";
import { ensureBusinessProvisionedForUser } from "@/lib/auth/ensureBusinessProvisioning";
import {
  getBusinessPasswordGateState,
  getBusinessRedirectDestination,
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

async function tryRedirectAuthenticatedBusiness({
  supabase,
  request,
  targetPath,
}: {
  supabase: ReturnType<typeof createSupabaseRouteHandlerClient>;
  request: NextRequest;
  targetPath: string;
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

  return NextResponse.redirect(
    new URL(
      getBusinessRedirectDestination({
        passwordSet: businessGate.passwordSet,
        onboardingComplete: businessGate.onboardingComplete,
        safeNext: targetPath,
      }),
      request.url
    )
  );
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code") || "";
  const targetPath = getTargetPath(requestUrl);
  const tokenHash = requestUrl.searchParams.get("token_hash") || "";
  const type = normalizeOtpType(requestUrl.searchParams.get("type") || "");
  const businessIntent = isBusinessIntentPath(targetPath);
  const fallbackPath = getFallbackPath(requestUrl, targetPath, businessIntent);

  if (process.env.NODE_ENV !== "production") {
    console.info("[AUTH_CALLBACK_TRACE] confirm_params", {
      hasCode: Boolean(code),
      hasTokenHash: Boolean(tokenHash),
      type: type || null,
      next: targetPath,
      businessIntent,
    });
  }

  const response = NextResponse.redirect(new URL(fallbackPath, request.url));
  const supabase = createSupabaseRouteHandlerClient(request, response);

  if (code) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[AUTH_CALLBACK_TRACE] confirm_path", {
        path: "code_exchange",
        businessIntent,
      });
    }

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[AUTH_CALLBACK_TRACE] confirm_fallback", {
          reason: "exchange_code_failed",
          destination: fallbackPath,
          code: error.code || null,
          message: error.message || null,
        });
      }
      return response;
    }
  } else if (tokenHash && type) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[AUTH_CALLBACK_TRACE] confirm_path", {
        path: "token_hash_verify",
        type,
        businessIntent,
      });
    }

    const { error } = await supabase.auth.verifyOtp({
      type: type as "email" | "recovery" | "invite" | "email_change",
      token_hash: tokenHash,
    });

    if (error) {
      if (businessIntent) {
        const authenticatedRedirect = await tryRedirectAuthenticatedBusiness({
          supabase,
          request,
          targetPath,
        });
        if (authenticatedRedirect) {
          return authenticatedRedirect;
        }
      }
      if (process.env.NODE_ENV !== "production") {
        console.warn("[AUTH_CALLBACK_TRACE] confirm_fallback", {
          reason: "verify_otp_failed",
          destination: fallbackPath,
          code: error.code || null,
          message: error.message || null,
        });
      }
      return response;
    }
  } else {
    if (process.env.NODE_ENV !== "production") {
      console.info("[AUTH_CALLBACK_TRACE] confirm_path", {
        path: "invalid_fallback",
        businessIntent,
      });
      console.warn("[AUTH_CALLBACK_TRACE] confirm_fallback", {
        reason: "missing_or_invalid_params",
        destination: fallbackPath,
      });
    }
    return response;
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[AUTH_CALLBACK_TRACE] confirm_verified", {
      destination: targetPath,
      verificationMethod: code ? "code_exchange" : "token_hash_verify",
      type: type || null,
      businessIntent,
    });
  }

  if (businessIntent) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[AUTH_CALLBACK_TRACE] confirm_fallback", {
          reason: "verify_succeeded_but_user_missing",
          destination: fallbackPath,
        });
      }
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

    response.headers.set(
      "location",
      new URL(
        getBusinessRedirectDestination({
          passwordSet: businessGate.passwordSet,
          onboardingComplete: businessGate.onboardingComplete,
          safeNext: targetPath,
        }),
        request.url
      ).toString()
    );
    return response;
  }

  response.headers.set("location", new URL(targetPath, request.url).toString());
  return response;
}
