import {
  resolveCurrentUserRoleFromClient,
  type CurrentUserRole,
} from "@/lib/auth/resolveCurrentUserRoleFromClient";

type RoleResolutionResult = {
  user: import("@supabase/supabase-js").User | null;
  role: CurrentUserRole;
};

export async function getCurrentUserRole(
  { log = false }: { log?: boolean } = {}
): Promise<RoleResolutionResult> {
  const { getSupabaseServerAuthedClient } = await import("@/lib/supabaseServer");
  const supabase = await getSupabaseServerAuthedClient();
  if (!supabase) return { user: null, role: "unknown" };
  return resolveCurrentUserRoleFromClient(supabase, { log });
}
