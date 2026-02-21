"use server";

import { NextResponse } from "next/server";
import { PATHS } from "@/lib/auth/paths";
import { getPostLoginRedirect, normalizeAppRole } from "@/lib/auth/redirects";
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
  const nextPath = nextParam && nextParam.startsWith("/") ? nextParam : null;
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

    let resolvedRole = normalizeAppRole(user?.app_metadata?.role);
    if (!resolvedRole) {
      const { data: profile } = await supabase
        .from("users")
        .select("role,is_internal")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.is_internal === true) {
        resolvedRole = "admin";
      } else {
        resolvedRole = normalizeAppRole(profile?.role);
      }
    }
    if (resolvedRole !== "admin") {
      const { data: adminRows, error: adminRolesError } = await supabase
        .from("admin_role_members")
        .select("role_key")
        .eq("user_id", user.id)
        .limit(1);
      if (!adminRolesError && (adminRows?.length || 0) > 0) {
        resolvedRole = "admin";
      }
    }

    const targetPath = getPostLoginRedirect({
      role: resolvedRole || "customer",
      requestedPath: nextPath,
      fallbackPath: resolvedRole === "business" ? PATHS.business.dashboard : PATHS.public.root,
    });

    if (process.env.NODE_ENV !== "production") {
      console.info("[AUTH_REDIRECT_TRACE] auth_callback", {
        role: resolvedRole || null,
        requestedPath: nextPath,
        chosenDestination: targetPath,
      });
    }

    return withAuthCookies(NextResponse.redirect(new URL(targetPath, origin)));
  } catch (err) {
    return response;
  }
}
