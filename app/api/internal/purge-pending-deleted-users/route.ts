import { NextResponse } from "next/server";
import { getAdminServiceRoleClient } from "@/lib/supabase/admin";
import { ACCOUNT_STATUS } from "@/lib/accountDeletion/status";
import { purgeUserAccount } from "@/lib/accountDeletion/purgeUserAccount";

const BATCH_SIZE = Number.parseInt(process.env.ACCOUNT_PURGE_BATCH_SIZE || "", 10) || 25;

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  const AUTH_TOKEN = String(process.env.ACCOUNT_PURGE_TOKEN || "").trim();
  if (!AUTH_TOKEN) {
    return NextResponse.json(
      { error: "ACCOUNT_PURGE_TOKEN is missing." },
      { status: 500 }
    );
  }

  const authHeader = String(request.headers.get("authorization") || "");
  if (authHeader !== `Bearer ${AUTH_TOKEN}`) {
    return unauthorized();
  }

  const adminClient = getAdminServiceRoleClient();

  const { data: targets, error: targetsError } = await adminClient
    .from("users")
    .select("id, role, scheduled_purge_at")
    .eq("account_status", ACCOUNT_STATUS.PENDING_DELETION)
    .lte("scheduled_purge_at", new Date().toISOString())
    .order("scheduled_purge_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (targetsError) {
    return NextResponse.json(
      { error: targetsError.message || "Failed to load purge targets." },
      { status: 500 }
    );
  }

  const rows = Array.isArray(targets) ? targets : [];
  const summary = {
    scanned: rows.length,
    purged: 0,
    skipped: 0,
    failed: 0,
    failures: [] as Array<{ userId: string; error: string; step?: string }>,
  };

  for (const row of rows) {
    const targetUserId = String(row?.id || "");
    if (!targetUserId) continue;

    const outcome = await purgeUserAccount({
      adminClient,
      userId: targetUserId,
    });

    if (outcome.ok && outcome.result === "purged") {
      summary.purged += 1;
      await adminClient.rpc("log_admin_action", {
        p_action: "account_deletion_purged",
        p_actor_user_id: targetUserId,
        p_target_type: "user",
        p_target_id: targetUserId,
        p_meta: {
          actor_user_id: null,
          target_user_id: targetUserId,
          role: row?.role || null,
          scheduled_purge_at: row?.scheduled_purge_at || null,
          result: "success",
          cleanup: outcome.cleanupSummary,
        },
      });
      continue;
    }

    if (outcome.ok && outcome.result !== "purged") {
      summary.skipped += 1;
      continue;
    }

    summary.failed += 1;
    summary.failures.push({
      userId: targetUserId,
      error: outcome.error || "Unknown purge failure",
      step: outcome.step,
    });

    await adminClient.rpc("log_admin_action", {
      p_action: "account_deletion_purge_failed",
      p_actor_user_id: targetUserId,
      p_target_type: "user",
      p_target_id: targetUserId,
      p_meta: {
        actor_user_id: null,
        target_user_id: targetUserId,
        role: row?.role || null,
        scheduled_purge_at: row?.scheduled_purge_at || null,
        result: "failed",
        step: outcome.step || null,
        error: outcome.error || "Unknown purge failure",
      },
    });
  }

  return NextResponse.json({ success: true, ...summary }, { status: 200 });
}
