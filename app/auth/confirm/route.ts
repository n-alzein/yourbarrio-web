import { NextRequest, NextResponse } from "next/server";
import { getSafeRedirectPath } from "@/lib/auth/redirects";
import { createSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

const OTP_TYPES = new Set(["email", "recovery", "invite", "email_change"]);

function getTargetPath(requestUrl: URL) {
  const safeNext = getSafeRedirectPath(requestUrl.searchParams.get("next"));
  return safeNext || "/set-password";
}

function getFallbackPath() {
  return "/auth/forgot-password?error=invalid_or_expired_link";
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const targetPath = getTargetPath(requestUrl);
  const tokenHash = requestUrl.searchParams.get("token_hash") || "";
  const type = requestUrl.searchParams.get("type") || "";

  const response = NextResponse.redirect(new URL(getFallbackPath(), request.url));
  const supabase = createSupabaseRouteHandlerClient(request, response);

  if (!tokenHash || !OTP_TYPES.has(type)) {
    return response;
  }

  const { error } = await supabase.auth.verifyOtp({
    type: type as "email" | "recovery" | "invite" | "email_change",
    token_hash: tokenHash,
  });

  if (error) {
    return response;
  }

  response.headers.set("location", new URL(targetPath, request.url).toString());
  return response;
}
