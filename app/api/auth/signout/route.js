"use server";

import { NextResponse } from "next/server";
import {
  clearSupabaseCookies,
  logSupabaseCookieDiagnostics,
} from "@/lib/authCookies";
import { createSupabaseRouteHandlerClient } from "@/lib/supabaseServer";
import {
  IMPERSONATE_SESSION_COOKIE,
  IMPERSONATE_TARGET_ROLE_COOKIE,
  IMPERSONATE_USER_COOKIE,
} from "@/lib/admin/supportMode";

const REDIRECT_COOKIE_KEYS = [
  "returnTo",
  "next",
  "callbackUrl",
  "postLoginRedirect",
  "yb:returnTo",
  "yb:postLoginRedirect",
];

function clearCookieByName(response, name) {
  const base = {
    path: "/",
    sameSite: "lax",
    maxAge: 0,
    expires: new Date(0),
  };
  [".yourbarrio.com", "www.yourbarrio.com", undefined].forEach((domain) => {
    response.cookies.set(name, "", {
      ...base,
      ...(domain ? { domain } : {}),
    });
  });
}

export async function POST(request) {
  const isProd = process.env.NODE_ENV === "production";
  const debug = process.env.NEXT_PUBLIC_DEBUG_AUTH === "1";
  const response = NextResponse.json({ ok: true }, { status: 200 });

  const log = (message, ...args) => {
    if (debug) console.log(`[auth/signout] ${message}`, ...args);
  };

  logSupabaseCookieDiagnostics({ req: request, debug, log });

  const supabase = createSupabaseRouteHandlerClient(request, response);

  try {
    await supabase.auth.signOut({ scope: "global" });
  } catch {
    // Best-effort: still clear cookies below.
  }

  clearSupabaseCookies(response, request, { isProd, debug, log });
  [
    IMPERSONATE_USER_COOKIE,
    IMPERSONATE_SESSION_COOKIE,
    IMPERSONATE_TARGET_ROLE_COOKIE,
    ...REDIRECT_COOKIE_KEYS,
  ].forEach((name) => clearCookieByName(response, name));
  response.headers.set("Cache-Control", "no-store");

  return response;
}
