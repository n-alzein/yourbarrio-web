import "server-only";

import { getActorAdminRoleKeys } from "@/lib/admin/getActorAdminRoleKeys";
import { type AdminRole } from "@/lib/admin/permissions";
import { getSupabaseServerAuthedClient } from "@/lib/supabaseServer";

const ROLE_ORDER: Record<AdminRole, number> = {
  admin_readonly: 10,
  admin_support: 20,
  admin_ops: 30,
  admin_super: 40,
};

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
  const requiredWeight = ROLE_ORDER[requiredRole];
  const hasRequiredRole = actorRoleKeys.some((roleKey) => {
    if (!(roleKey in ROLE_ORDER)) return false;
    return ROLE_ORDER[roleKey as AdminRole] >= requiredWeight;
  });

  if (!hasRequiredRole) {
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
