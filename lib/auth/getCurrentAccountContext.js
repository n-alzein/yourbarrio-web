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
import { ensureUserProvisionedForUser } from "@/lib/auth/ensureUserProvisioning";

function shouldLogProvisioningRecovery() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.AUTH_DIAG_SERVER === "1" ||
    process.env.NEXT_PUBLIC_AUTH_DIAG === "1"
  );
}

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

  const [{ data: initialProfile, error: profileError }, { data: businessRow }] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("businesses")
      .select("owner_user_id")
      .eq("owner_user_id", user.id)
      .maybeSingle(),
  ]);
  let profile = initialProfile ?? null;

  if (!profile && !profileError) {
    try {
      const recovery = await ensureUserProvisionedForUser({
        userId: user.id,
        email: user.email || "",
        fallbackRole: user.app_metadata?.role || user.user_metadata?.role || "customer",
        source,
        debug: shouldLogProvisioningRecovery(),
      });
      const { data: recoveredProfile, error: recoveredProfileError } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      profile = recoveredProfile ?? null;
      if (shouldLogProvisioningRecovery()) {
        console.info("[AUTH_PROFILE_BOOTSTRAP]", {
          source,
          userId: user.id,
          authUserExists: true,
          profileExisted: false,
          recoveryAttempted: true,
          recoveryCreated: recovery?.userCreated === true,
          recoveredProfileExists: Boolean(profile),
          recoveredProfileError: recoveredProfileError?.message || null,
        });
      }
    } catch (error) {
      if (shouldLogProvisioningRecovery()) {
        console.warn("[AUTH_PROFILE_BOOTSTRAP]", {
          source,
          userId: user.id,
          authUserExists: true,
          profileExisted: false,
          recoveryAttempted: true,
          recoveredProfileExists: false,
          error: error?.message || String(error),
        });
      }
    }
  } else if (shouldLogProvisioningRecovery()) {
    console.info("[AUTH_PROFILE_BOOTSTRAP]", {
      source,
      userId: user.id,
      authUserExists: true,
      profileExisted: Boolean(profile),
      profileError: profileError?.message || null,
      recoveryAttempted: false,
    });
  }

  const context = buildCurrentAccountContext({
    user,
    profile,
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
