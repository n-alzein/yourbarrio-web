import { NextRequest, NextResponse } from "next/server";
import {
  getRequiredBusinessId,
  logBusinessPasswordSetupGate,
  logBusinessRowMissingGate,
  resolveRoleFromUserAndClient,
} from "@/lib/business/requireBusinessRow";
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
  if (!supabase) return redirectTo(request, HOME_PATH);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    response.headers.set("location", new URL(LOGIN_PATH, request.url).toString());
    return response;
  }

  const role = await resolveRoleFromUserAndClient(supabase, user);
  if (role !== "business") {
    response.headers.set("location", new URL(HOME_PATH, request.url).toString());
    return response;
  }

  try {
    await getRequiredBusinessId({ supabase, userId: user.id, role });
    response.headers.set("location", new URL(BUSINESS_ACCOUNT_PATH, request.url).toString());
    return response;
  } catch (error: any) {
    if (error?.code === "PASSWORD_SETUP_REQUIRED") {
      logBusinessPasswordSetupGate();
      response.headers.set("location", new URL(CREATE_PASSWORD_PATH, request.url).toString());
      return response;
    }
    if (error?.code === "BUSINESS_ROW_MISSING") {
      logBusinessRowMissingGate();
      response.headers.set("location", new URL(ONBOARDING_PATH, request.url).toString());
      return response;
    }
    response.headers.set("location", new URL(HOME_PATH, request.url).toString());
    return response;
  }
}
