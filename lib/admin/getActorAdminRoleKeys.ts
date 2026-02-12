import "server-only";

import { getAdminServiceRoleClient } from "@/lib/supabase/admin";

export async function getActorAdminRoleKeys(actorUserId?: string | null): Promise<string[]> {
  if (!actorUserId) return [];

  const adminClient = getAdminServiceRoleClient();
  const { data, error } = await adminClient
    .from("admin_role_members")
    .select("role_key")
    .eq("user_id", actorUserId);

  if (error || !Array.isArray(data)) return [];

  return data
    .map((row) => String(row?.role_key || "").trim())
    .filter(Boolean);
}
