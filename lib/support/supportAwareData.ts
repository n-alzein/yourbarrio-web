import "server-only";

import { isBlockedAccountStatus, normalizeAccountStatus } from "@/lib/accountDeletion/status";
import { getSupportModeEffectiveUser } from "@/lib/admin/supportModeEffectiveUser";
import { getSupabaseServerAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerAuthedClient, getUserCached } from "@/lib/supabaseServer";

type SupportContext = {
  supportModeActive: boolean;
  actorUserId: string | null;
  targetUserId: string | null;
  targetRole: "customer" | "business" | null;
};

type GetSupportAwareClientOptions = {
  expectedRole?: "customer" | "business";
  feature?: string;
};

export async function getSupportContext(): Promise<SupportContext> {
  const authedClient = await getSupabaseServerAuthedClient();
  if (!authedClient) {
    return {
      supportModeActive: false,
      actorUserId: null,
      targetUserId: null,
      targetRole: null,
    };
  }

  const { user } = await getUserCached(authedClient);
  if (!user?.id) {
    return {
      supportModeActive: false,
      actorUserId: null,
      targetUserId: null,
      targetRole: null,
    };
  }

  const support = await getSupportModeEffectiveUser(user.id);
  return {
    supportModeActive: support.isSupportMode,
    actorUserId: user.id,
    targetUserId: support.isSupportMode ? support.targetUserId : null,
    targetRole: support.isSupportMode ? support.targetRole : null,
  };
}

export async function getSupportAwareClient(
  options: GetSupportAwareClientOptions = {}
) {
  const { expectedRole, feature = "unknown" } = options;
  const authedClient = await getSupabaseServerAuthedClient();
  if (!authedClient) {
    throw new Error("Unauthorized");
  }

  const { user } = await getUserCached(authedClient);
  if (!user?.id) {
    throw new Error("Unauthorized");
  }

  const support = await getSupportModeEffectiveUser(user.id);
  const effectiveUserId = support.isSupportMode ? support.targetUserId : user.id;
  const lifecycleReader = support.isSupportMode
    ? getSupabaseServerAdminClient()
    : authedClient;
  const { data: profile } = await lifecycleReader
    .from("users")
    .select("account_status")
    .eq("id", effectiveUserId)
    .maybeSingle();
  const accountStatus = normalizeAccountStatus(profile?.account_status);

  if (isBlockedAccountStatus(accountStatus)) {
    throw new Error("Account unavailable");
  }

  if (support.isSupportMode) {
    if (expectedRole && support.targetRole !== expectedRole) {
      throw new Error("Wrong surface");
    }
    const diagEnabled = String(process.env.NEXT_PUBLIC_AUTH_DIAG || "") === "1";
    if (diagEnabled) {
      console.warn("[support-data] support read", {
        feature,
        effectiveUserId,
        actorUserId: support.actorUserId,
      });
    }
    return {
      client: getSupabaseServerAdminClient(),
      effectiveUserId,
      actorUserId: support.actorUserId,
      targetRole: support.targetRole,
      supportModeActive: true,
      mode: "support-service" as const,
    };
  }

  return {
    client: authedClient,
    effectiveUserId,
    actorUserId: user.id,
    targetRole: null,
    supportModeActive: false,
    mode: "authed" as const,
  };
}
