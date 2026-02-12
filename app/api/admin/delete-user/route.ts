import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { getSupabaseServerAuthedClient } from "@/lib/supabaseServer";
import { getAdminServiceRoleClient } from "@/lib/supabase/admin";

const deleteUserSchema = z.object({
  userId: z.string().uuid(),
});

const REQUIRED_DELETE_ROLE = "admin_super";

export async function POST(request: Request) {
  const authedClient = await getSupabaseServerAuthedClient();
  if (!authedClient) {
    return NextResponse.json({ error: "Authentication client unavailable" }, { status: 500 });
  }

  const {
    data: { user: actorUser },
    error: authError,
  } = await authedClient.auth.getUser();

  if (authError || !actorUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = deleteUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { userId } = parsed.data;
  if (userId === actorUser.id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  // Use service role for trusted role checks and admin deletion API access.
  const adminClient = getAdminServiceRoleClient();

  const { data: actorRoles, error: actorRolesError } = await adminClient
    .from("admin_role_members")
    .select("role_key")
    .eq("user_id", actorUser.id);

  if (actorRolesError) {
    return NextResponse.json({ error: "Failed to verify admin role" }, { status: 500 });
  }

  const canDelete = (actorRoles || []).some(
    (row) => String(row?.role_key || "") === REQUIRED_DELETE_ROLE
  );

  if (!canDelete) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Permanent delete in Supabase Auth (shouldSoftDelete = false).
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId, false);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message || "Delete failed" }, { status: 500 });
  }

  // Non-blocking audit record. Deletion success must not depend on audit availability.
  try {
    await audit({
      action: "user_delete",
      targetType: "user",
      targetId: userId,
      actorUserId: actorUser.id,
      meta: { permanent: true },
    });
  } catch {}

  return NextResponse.json({ success: true });
}
