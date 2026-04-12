import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseRouteHandlerClient } from "@/lib/supabaseServer";
import { ACCOUNT_STATUS, normalizeAccountStatus } from "@/lib/accountDeletion/status";
import {
  isMarkPendingDeletionFailure,
  markUserPendingDeletion,
} from "@/lib/accountDeletion/markPendingDeletion";

const requestAccountDeletionSchema = z.object({
  confirmationText: z.string().trim().min(1),
  confirmationEmail: z.string().email().optional(),
  reason: z.string().trim().max(500).optional(),
});

const DELETE_CONFIRMATION_TEXT = "DELETE";
export async function handleRequestAccountDeletion(request: Request) {
  const response = NextResponse.next();
  const supabase = createSupabaseRouteHandlerClient(request, response);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = requestAccountDeletionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { confirmationText, confirmationEmail, reason } = parsed.data;
  if (confirmationText.trim().toUpperCase() !== DELETE_CONFIRMATION_TEXT) {
    return NextResponse.json(
      { error: `Type ${DELETE_CONFIRMATION_TEXT} to confirm account deletion.` },
      { status: 400 }
    );
  }

  if (confirmationEmail && String(user.email || "").toLowerCase() !== confirmationEmail.toLowerCase()) {
    return NextResponse.json({ error: "Confirmation email does not match." }, { status: 400 });
  }

  const { data: profileRow, error: profileError } = await supabase
    .from("users")
    .select("id, role, email, account_status, scheduled_purge_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profileRow?.id) {
    return NextResponse.json({ error: "Account profile not found." }, { status: 404 });
  }

  const existingStatus = normalizeAccountStatus(profileRow.account_status);
  if (existingStatus === ACCOUNT_STATUS.PENDING_DELETION) {
    return NextResponse.json(
      {
        success: true,
        message: "Your account is scheduled for deletion.",
      },
      { status: 200 }
    );
  }

  if (existingStatus === ACCOUNT_STATUS.DELETED) {
    return NextResponse.json({ error: "This account is no longer available." }, { status: 409 });
  }

  const markResult = await markUserPendingDeletion({
    client: supabase,
    userId: user.id,
    deletedByAdminUserId: null,
    reason: reason || "user_initiated",
  });

  if (isMarkPendingDeletionFailure(markResult)) {
    return NextResponse.json(
      { error: markResult.error, step: markResult.step },
      { status: markResult.status }
    );
  }

  const role = String(profileRow.role || "").trim().toLowerCase();
  await supabase.rpc("log_admin_action", {
    p_action: "account_deletion_requested",
    p_actor_user_id: user.id,
    p_target_type: "user",
    p_target_id: user.id,
    p_meta: {
      actor_user_id: user.id,
      target_user_id: user.id,
      role,
      reason: reason || "user_initiated",
      scheduled_purge_at: markResult.scheduledPurgeAt,
      result: "success",
    },
  });

  return NextResponse.json(
    {
      success: true,
      message: "Your account is scheduled for deletion.",
    },
    { status: 200 }
  );
}
