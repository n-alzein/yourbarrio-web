"use server";

import { NextResponse } from "next/server";
import { PATHS } from "@/lib/auth/paths";
import {
  createSupabaseRouteHandlerClient,
  getUserCached,
} from "@/lib/supabaseServer";

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const code = requestUrl.searchParams.get("code");
  const authDiagEnabled = process.env.NEXT_PUBLIC_AUTH_DIAG === "1";
  const response = NextResponse.redirect(new URL(PATHS.public.root, origin));
  const nextParam = requestUrl.searchParams.get("next");
  const nextPath =
    nextParam && nextParam.startsWith("/") ? nextParam : PATHS.business.onboarding;
  const supabase = createSupabaseRouteHandlerClient(request, response);

  const withAuthCookies = (targetResponse) => {
    response.cookies.getAll().forEach(({ name, value }) => {
      targetResponse.cookies.set(name, value);
    });
    return targetResponse;
  };

  try {
    if (code) {
      if (authDiagEnabled) {
        console.log("[AUTH_DIAG]", {
          timestamp: new Date().toISOString(),
          pathname: requestUrl.pathname,
          label: "auth:exchangeCodeForSession",
          stack: new Error().stack,
        });
      }
      await supabase.auth.exchangeCodeForSession(code);
    }

    const { user } = await getUserCached(supabase);

    if (!user) {
      return response;
    }

    return withAuthCookies(NextResponse.redirect(new URL(nextPath, origin)));
  } catch (err) {
    return response;
  }
}
