import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiRole } from "@/lib/admin/requireAdminApiRole";
import type { AdminApiAuthFailure } from "@/lib/admin/requireAdminApiRole";
import { getAdminServiceRoleClient } from "@/lib/supabase/admin";
import { ACCOUNT_STATUS, normalizeAccountStatus } from "@/lib/accountDeletion/status";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApiRole("admin_super");
  if (!auth.ok) {
    const failure = auth as AdminApiAuthFailure;
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }

  const params = await context.params;
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const targetUserId = parsed.data.id;
  const adminClient = getAdminServiceRoleClient();

  const { data: target, error: targetError } = await adminClient
    .from("users")
    .select("id, role, account_status, scheduled_purge_at")
    .eq("id", targetUserId)
    .maybeSingle();

  if (targetError || !target?.id) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const currentStatus = normalizeAccountStatus(target.account_status);
  if (currentStatus !== ACCOUNT_STATUS.PENDING_DELETION) {
    return NextResponse.json(
      { error: "User is not pending deletion." },
      { status: 409 }
    );
  }

  const nowIso = new Date().toISOString();

  const { error: restoreError } = await adminClient
    .from("users")
    .update({
      account_status: ACCOUNT_STATUS.ACTIVE,
      deletion_requested_at: null,
      scheduled_purge_at: null,
      deleted_at: null,
      restored_at: nowIso,
      restored_by_admin_user_id: auth.actorUser.id,
      deleted_by_admin_user_id: null,
      deletion_reason: null,
    })
    .eq("id", targetUserId)
    .eq("account_status", ACCOUNT_STATUS.PENDING_DELETION);

  if (restoreError) {
    return NextResponse.json(
      { error: restoreError.message || "Failed to restore user." },
      { status: 500 }
    );
  }

  const role = String(target.role || "").trim().toLowerCase();
  if (role === "business") {
    await adminClient
      .from("businesses")
      .update({
        account_status: ACCOUNT_STATUS.ACTIVE,
        deletion_requested_at: null,
        scheduled_purge_at: null,
        deleted_at: null,
        restored_at: nowIso,
      })
      .eq("owner_user_id", targetUserId);
  }

  await adminClient.rpc("log_admin_action", {
    p_action: "account_deletion_restored",
    p_actor_user_id: auth.actorUser.id,
    p_target_type: "user",
    p_target_id: targetUserId,
    p_meta: {
      actor_user_id: auth.actorUser.id,
      target_user_id: targetUserId,
      role,
      scheduled_purge_at: target.scheduled_purge_at || null,
      result: "success",
    },
  });

  return NextResponse.json(
    {
      success: true,
      accountStatus: ACCOUNT_STATUS.ACTIVE,
      restoredAt: nowIso,
    },
    { status: 200 }
  );
}
