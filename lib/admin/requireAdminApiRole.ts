import "server-only";

import { getActorAdminRoleKeys } from "@/lib/admin/getActorAdminRoleKeys";
import { type AdminRole } from "@/lib/admin/permissions";
import { getSupabaseServerAuthedClient } from "@/lib/supabaseServer";

export type AdminApiAuthSuccess = {
  ok: true;
  actorUser: { id: string; email: string | null };
  actorRoleKeys: string[];
};

export type AdminApiAuthFailure = {
  ok: false;
  status: 401 | 403 | 500;
  error: string;
};

export type AdminApiAuthResult = AdminApiAuthSuccess | AdminApiAuthFailure;

export async function requireAdminApiRole(requiredRole: AdminRole): Promise<AdminApiAuthResult> {
  const authedClient = await getSupabaseServerAuthedClient();
  if (!authedClient) {
    return { ok: false, status: 500, error: "Authentication client unavailable" };
  }

  const {
    data: { user: actorUser },
    error: authError,
  } = await authedClient.auth.getUser();

  if (authError || !actorUser) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const actorRoleKeys = await getActorAdminRoleKeys(actorUser.id);
  if (!actorRoleKeys.includes(requiredRole)) {
    return { ok: false, status: 403, error: "You don't have permission." };
  }

  return {
    ok: true,
    actorUser: {
      id: actorUser.id,
      email: actorUser.email || null,
    },
    actorRoleKeys,
  };
}
