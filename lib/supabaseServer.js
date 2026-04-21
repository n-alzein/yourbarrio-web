import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getCookieBaseOptions } from "@/lib/authCookies";
import { createServerTiming, logServerTiming, perfTimingEnabled } from "@/lib/serverTiming";
import { isRefreshTokenAlreadyUsedError } from "@/lib/auth/refreshTokenErrors";

function ensureSupabaseEnv() {
  const missing = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  if (missing.length && process.env.NODE_ENV !== "production") {
    throw new Error(`Missing Supabase env: ${missing.join(", ")}`);
  }
  return missing.length === 0;
}

function buildServerClient({ getAll, setAll, cookieOptions }) {
  if (!ensureSupabaseEnv()) return null;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions,
      cookies: {
        getAll,
        setAll,
      },
    }
  );
}

export const getSupabaseServerAuthedClient = cache(async () => {
  const timing = createServerTiming("sb_server_");
  const t0 = timing.start();
  const cookieStore = await cookies();
  const host = (await headers()).get("host");
  const isProd = process.env.NODE_ENV === "production";
  const cookieBaseOptions = getCookieBaseOptions({ host, isProd });

  if (typeof cookieStore?.getAll !== "function") {
    if (process.env.NODE_ENV !== "production") {
      throw new Error(
        `getSupabaseServerClient expected cookieStore.getAll(), got ${typeof cookieStore}`
      );
    }
  }

  const client = buildServerClient({
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      try {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, {
            ...options,
            ...cookieBaseOptions,
          });
        });
      } catch {}
    },
  });
  const buildMs = timing.end("build", t0);
  if (await perfTimingEnabled()) {
    await logServerTiming("getSupabaseServerClient", { buildMs });
  }
  return client;
});

// Backward-compatible alias.
export const getSupabaseServerClient = getSupabaseServerAuthedClient;

export function createSupabaseRouteHandlerClient(
  request,
  response,
  { cookieName } = {}
) {
  const host = request.headers.get("host");
  const isProd = process.env.NODE_ENV === "production";
  const cookieBaseOptions = getCookieBaseOptions({ host, isProd });

  return buildServerClient({
    cookieOptions: cookieName ? { name: cookieName } : undefined,
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
  });
}

export const getUserCached = cache(async (supabaseOverride) => {
  const timing = createServerTiming("sb_user_");
  const t0 = timing.start();
  const supabase = supabaseOverride ?? (await getSupabaseServerClient());
  const clientMs = timing.end("client", t0);
  if (!supabase?.auth?.getUser) {
    return { user: null, error: null };
  }
  const t1 = timing.start();
  const { data, error } = await supabase.auth.getUser();
  const fetchMs = timing.end("fetch", t1);
  if (await perfTimingEnabled()) {
    await logServerTiming("getUserCached", { clientMs, fetchMs, totalMs: Math.round(clientMs + fetchMs) });
  }
  return { user: data?.user ?? null, error };
});

export const getProfileCached = cache(async (userId, supabaseOverride) => {
  if (!userId) return null;
  const timing = createServerTiming("sb_profile_");
  const t0 = timing.start();
  const supabase = supabaseOverride ?? (await getSupabaseServerClient());
  const clientMs = timing.end("client", t0);
  if (!supabase) return null;
  const t1 = timing.start();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  const queryMs = timing.end("query", t1);
  if (await perfTimingEnabled()) {
    await logServerTiming("getProfileCached", {
      clientMs,
      queryMs,
      totalMs: Math.round(clientMs + queryMs),
    });
  }
  if (error) return null;
  return data ?? null;
});

export { isRefreshTokenAlreadyUsedError };

export const createSupabaseServerClient = getSupabaseServerClient;
