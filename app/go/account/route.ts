import { NextRequest, NextResponse } from "next/server";
import {
  getRequiredBusinessId,
  logBusinessPasswordSetupGate,
  logBusinessRowMissingGate,
  resolveRoleFromUserAndClient,
} from "@/lib/business/requireBusinessRow";
import {
  getBusinessAuthCookieNames,
  logBusinessRedirectTrace,
} from "@/lib/auth/businessPasswordGate";
import { createSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

const LOGIN_PATH = "/signin?modal=signin&next=%2Fgo%2Faccount";
const HOME_PATH = "/";
const ONBOARDING_PATH = "/onboarding";
const BUSINESS_ACCOUNT_PATH = "/business/settings";
const CREATE_PASSWORD_PATH = "/business-auth/create-password";

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url));
}

export async function GET(request: NextRequest) {
  const response = redirectTo(request, HOME_PATH);
  const supabase = createSupabaseRouteHandlerClient(request, response);
  const authCookieNames = getBusinessAuthCookieNames(request.cookies.getAll());
  if (!supabase) return redirectTo(request, HOME_PATH);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    logBusinessRedirectTrace("go_account_route", {
      pathname: "/go/account",
      authCookieNames,
      userId: null,
      role: null,
      sessionExists: false,
      password_set: null,
      onboardingState: null,
      redirectDestination: LOGIN_PATH,
      redirectReason: "no_session",
    });
    response.headers.set("location", new URL(LOGIN_PATH, request.url).toString());
    return response;
  }

  const role = await resolveRoleFromUserAndClient(supabase, user);
  if (role !== "business") {
    logBusinessRedirectTrace("go_account_route", {
      pathname: "/go/account",
      authCookieNames,
      userId: user.id,
      role,
      sessionExists: true,
      password_set: null,
      onboardingState: null,
      redirectDestination: HOME_PATH,
      redirectReason: role ? "wrong_role" : "role_unresolved",
    });
    response.headers.set("location", new URL(HOME_PATH, request.url).toString());
    return response;
  }

  try {
    await getRequiredBusinessId({ supabase, userId: user.id, role });
    logBusinessRedirectTrace("go_account_route", {
      pathname: "/go/account",
      authCookieNames,
      userId: user.id,
      role,
      sessionExists: true,
      password_set: true,
      onboardingState: true,
      redirectDestination: BUSINESS_ACCOUNT_PATH,
      redirectReason: "account_ready",
    });
    response.headers.set("location", new URL(BUSINESS_ACCOUNT_PATH, request.url).toString());
    return response;
  } catch (error: any) {
    if (error?.code === "PASSWORD_SETUP_REQUIRED") {
      logBusinessPasswordSetupGate();
      logBusinessRedirectTrace("go_account_route", {
        pathname: "/go/account",
        authCookieNames,
        userId: user.id,
        role,
        sessionExists: true,
        password_set: false,
        onboardingState: null,
        redirectDestination: CREATE_PASSWORD_PATH,
        redirectReason: "password_setup_required",
      });
      response.headers.set("location", new URL(CREATE_PASSWORD_PATH, request.url).toString());
      return response;
    }
    if (error?.code === "BUSINESS_ROW_MISSING") {
      logBusinessRowMissingGate();
      logBusinessRedirectTrace("go_account_route", {
        pathname: "/go/account",
        authCookieNames,
        userId: user.id,
        role,
        sessionExists: true,
        password_set: true,
        onboardingState: false,
        redirectDestination: ONBOARDING_PATH,
        redirectReason: "business_row_missing",
      });
      response.headers.set("location", new URL(ONBOARDING_PATH, request.url).toString());
      return response;
    }
    logBusinessRedirectTrace("go_account_route", {
      pathname: "/go/account",
      authCookieNames,
      userId: user.id,
      role,
      sessionExists: true,
      password_set: null,
      onboardingState: null,
      redirectDestination: HOME_PATH,
      redirectReason: error?.code || "unexpected_error",
    });
    response.headers.set("location", new URL(HOME_PATH, request.url).toString());
    return response;
  }
}
