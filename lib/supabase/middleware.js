import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  clearSupabaseCookies,
  getCookieBaseOptions,
  getSbCookieNamesFromRequest,
} from "@/lib/authCookies";
import { isRefreshTokenAlreadyUsedError } from "@/lib/auth/refreshTokenErrors";

export async function updateSession(request, requestHeaders) {
  const hasSupabaseCookies = getSbCookieNamesFromRequest(request).length > 0;
  const response = requestHeaders
    ? NextResponse.next({ request: { headers: requestHeaders } })
    : NextResponse.next();
  if (!hasSupabaseCookies) return response;

  const isProd = process.env.NODE_ENV === "production";
  const authDiagEnabled = process.env.NEXT_PUBLIC_AUTH_DIAG === "1";
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

  const { error } = await supabase.auth.getUser();
  if (error && isRefreshTokenAlreadyUsedError(error)) {
    if (authDiagEnabled) {
      console.warn("[AUTH_DIAG] refresh_token_already_used", {
        pathname: request.nextUrl.pathname,
        message: error?.message,
      });
    }
    clearSupabaseCookies(response, request, {
      isProd,
      debug: authDiagEnabled,
      log: (...args) => console.warn("[AUTH_DIAG]", ...args),
    });
    response.headers.set(
      "x-supabase-refresh-error",
      "refresh_token_already_used"
    );
  }

  return response;
}
