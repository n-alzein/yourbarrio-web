import "server-only";

import { headers as nextHeaders } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";
import {
  createSupabaseRouteHandlerClient,
  getSupabaseServerAuthedClient,
} from "@/lib/supabaseServer";
import {
  buildCurrentAccountContext,
  logCurrentAccountContext,
} from "@/lib/auth/currentAccountContext";

export async function getCurrentAccountContext({
  request = null,
  response = null,
  supabase: supabaseOverride = null,
  source = "server",
} = {}) {
  noStore();

  const supabase =
    supabaseOverride ||
    (request && response
      ? createSupabaseRouteHandlerClient(request, response)
      : await getSupabaseServerAuthedClient());

  if (!supabase?.auth?.getUser) {
    return buildCurrentAccountContext();
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return buildCurrentAccountContext();
  }

  const [{ data: profile }, { data: businessRow }] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("businesses")
      .select("owner_user_id")
      .eq("owner_user_id", user.id)
      .maybeSingle(),
  ]);

  const context = buildCurrentAccountContext({
    user,
    profile: profile ?? null,
    // Debug only. Purchase eligibility must come from public.users.role, never
    // from the existence of a businesses row or onboarding state.
    businessRowExists: Boolean(businessRow?.owner_user_id),
  });

  let host = request?.headers?.get?.("host") || null;
  if (!host) {
    try {
      host = (await nextHeaders()).get("host");
    } catch {
      host = null;
    }
  }

  logCurrentAccountContext({ source, host, context });
  return context;
}
