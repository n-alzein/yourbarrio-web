import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.84.0";

const ACCOUNT_STATUS = {
  PENDING_DELETION: "pending_deletion",
  DELETED: "deleted",
} as const;

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FinalizerRequest = {
  dryRun?: boolean;
  limit?: number;
  source?: string | null;
  userId?: string | null;
};

type FinalizeUserResult = {
  ok: boolean;
  userId: string;
  step?:
    | "delete_saved_listings"
    | "delete_carts"
    | "delete_vendor_members"
    | "delete_notifications"
    | "anonymize_orders"
    | "soft_delete_auth"
    | "anonymize_business"
    | "anonymize_user"
    | "audit_log";
  error?: string;
  cleanup?: Record<string, number>;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function getRequiredEnv(name: string) {
  const value = String(Deno.env.get(name) || "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getBearerToken(req: Request) {
  const authHeader = String(req.headers.get("authorization") || "");
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token.trim();
}

function normalizePayload(body: FinalizerRequest | null) {
  const rawLimit = Number(body?.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(MAX_BATCH_SIZE, Math.trunc(rawLimit)))
    : DEFAULT_BATCH_SIZE;
  const userId = String(body?.userId || "").trim();
  return {
    dryRun: body?.dryRun === true,
    limit,
    source: String(body?.source || "edge_function").trim() || "edge_function",
    userId: UUID_RE.test(userId) ? userId : null,
  };
}

function buildDeletedEmail(userId: string) {
  return `deleted+${userId}@yourbarrio.invalid`;
}

function isNotFoundAuthError(error: unknown) {
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  return message.includes("not found") || message.includes("user not found");
}

async function deleteWithCount(
  adminClient: SupabaseClient,
  table: string,
  match: Record<string, string>,
) {
  let query: any = adminClient.from(table).delete().select("id");
  for (const [key, value] of Object.entries(match)) {
    query = query.eq(key, value);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(`${table}: ${error.message || "delete failed"}`);
  }
  return Array.isArray(data) ? data.length : 0;
}

async function finalizeSingleUser(
  adminClient: SupabaseClient,
  user: { id: string; role?: string | null; scheduled_purge_at?: string | null },
  source: string,
): Promise<FinalizeUserResult> {
  const userId = user.id;
  const nowIso = new Date().toISOString();
  const cleanup: Record<string, number> = {};

  try {
    cleanup.saved_listings = await deleteWithCount(adminClient, "saved_listings", {
      user_id: userId,
    });
  } catch (error) {
    return {
      ok: false,
      userId,
      step: "delete_saved_listings",
      error: error instanceof Error ? error.message : "Failed to delete saved listings",
    };
  }

  try {
    cleanup.carts = await deleteWithCount(adminClient, "carts", { user_id: userId });
  } catch (error) {
    return {
      ok: false,
      userId,
      step: "delete_carts",
      error: error instanceof Error ? error.message : "Failed to delete carts",
    };
  }

  try {
    cleanup.vendor_members = await deleteWithCount(adminClient, "vendor_members", {
      user_id: userId,
    });
  } catch (error) {
    return {
      ok: false,
      userId,
      step: "delete_vendor_members",
      error: error instanceof Error ? error.message : "Failed to delete vendor memberships",
    };
  }

  try {
    cleanup.notifications = await deleteWithCount(adminClient, "notifications", {
      recipient_user_id: userId,
    });
  } catch (error) {
    return {
      ok: false,
      userId,
      step: "delete_notifications",
      error: error instanceof Error ? error.message : "Failed to delete notifications",
    };
  }

  const { error: ordersError } = await adminClient
    .from("orders")
    .update({
      contact_name: "Deleted User",
      contact_phone: null,
      contact_email: null,
      delivery_address1: null,
      delivery_address2: null,
      delivery_city: null,
      delivery_state: null,
      delivery_postal_code: null,
      delivery_instructions: null,
    })
    .eq("user_id", userId);

  if (ordersError) {
    return {
      ok: false,
      userId,
      step: "anonymize_orders",
      error: ordersError.message || "Failed to anonymize order contacts",
    };
  }

  const { error: authError } = await adminClient.auth.admin.deleteUser(userId, true);
  if (authError && !isNotFoundAuthError(authError)) {
    return {
      ok: false,
      userId,
      step: "soft_delete_auth",
      error: authError.message || "Failed to soft-delete auth user",
    };
  }

  const { error: businessError } = await adminClient
    .from("businesses")
    .update({
      account_status: ACCOUNT_STATUS.DELETED,
      deleted_at: nowIso,
      restored_at: null,
      scheduled_purge_at: null,
      verification_status: "suspended",
      business_name: "Deleted user",
      description: null,
      website: null,
      phone: null,
      profile_photo_url: null,
      cover_photo_url: null,
      address: null,
      address_2: null,
      city: null,
      state: null,
      postal_code: null,
      latitude: null,
      longitude: null,
      hours_json: null,
      social_links_json: null,
    })
    .eq("owner_user_id", userId);

  if (businessError) {
    return {
      ok: false,
      userId,
      step: "anonymize_business",
      error: businessError.message || "Failed to anonymize business row",
    };
  }

  const { error: userError } = await adminClient
    .from("users")
    .update({
      account_status: ACCOUNT_STATUS.DELETED,
      deleted_at: nowIso,
      anonymized_at: nowIso,
      scheduled_purge_at: null,
      full_name: "Deleted user",
      business_name: "Deleted user",
      email: buildDeletedEmail(userId),
      profile_photo_url: null,
      phone: null,
      category: null,
      business_type: null,
      description: null,
      website: null,
      address: null,
      address_2: null,
      city: null,
      state: null,
      postal_code: null,
    })
    .eq("id", userId)
    .eq("account_status", ACCOUNT_STATUS.PENDING_DELETION);

  if (userError) {
    return {
      ok: false,
      userId,
      step: "anonymize_user",
      error: userError.message || "Failed to finalize user row",
    };
  }

  const role = String(user.role || "").trim().toLowerCase() || null;
  const { error: auditError } = await adminClient.rpc("log_admin_action", {
    p_action: "account_deletion_finalized",
    p_actor_user_id: userId,
    p_target_type: "user",
    p_target_id: userId,
    p_meta: {
      actor_user_id: null,
      target_user_id: userId,
      role,
      scheduled_purge_at: user.scheduled_purge_at || null,
      source,
      result: "success",
      cleanup,
      auth_deleted: authError ? "already_missing" : "soft_deleted",
    },
  });

  if (auditError) {
    return {
      ok: false,
      userId,
      step: "audit_log",
      error: auditError.message || "Failed to write finalization audit log",
      cleanup,
    };
  }

  return {
    ok: true,
    userId,
    cleanup,
  };
}

export async function handleFinalizeOverdueDeletions(req: Request) {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const expectedToken = getRequiredEnv("ACCOUNT_DELETION_FINALIZER_TOKEN");
  const providedToken = getBearerToken(req);
  if (!providedToken || providedToken !== expectedToken) {
    return json({ error: "Unauthorized" }, 401);
  }

  const payload = normalizePayload(await req.json().catch(() => null));
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const nowIso = new Date().toISOString();
  let query: any = adminClient
    .from("users")
    .select("id, role, scheduled_purge_at, deleted_at, account_status")
    .eq("account_status", ACCOUNT_STATUS.PENDING_DELETION)
    .lte("scheduled_purge_at", nowIso)
    .is("deleted_at", null)
    .order("scheduled_purge_at", { ascending: true })
    .limit(payload.limit);

  if (payload.userId) {
    query = query.eq("id", payload.userId);
  }

  const { data: rows, error: rowsError } = await query;
  if (rowsError) {
    console.error("[finalize-overdue-deletions] load_failed", {
      source: payload.source,
      message: rowsError.message,
      userId: payload.userId,
      limit: payload.limit,
    });
    return json(
      {
        success: false,
        error: rowsError.message || "Failed to load overdue users",
        step: "load_overdue_users",
      },
      500,
    );
  }

  const overdueUsers = Array.isArray(rows) ? rows : [];
  const runId = crypto.randomUUID();

  console.log("[finalize-overdue-deletions] invoked", {
    runId,
    source: payload.source,
    dryRun: payload.dryRun,
    userId: payload.userId,
    limit: payload.limit,
    found: overdueUsers.length,
  });

  if (payload.dryRun) {
    return json({
      success: true,
      runId,
      source: payload.source,
      dryRun: true,
      scanned: overdueUsers.length,
      finalized: 0,
      skipped: 0,
      failed: 0,
      overdueUserIds: overdueUsers.map((row) => row.id),
      failures: [],
    });
  }

  const summary = {
    success: true,
    runId,
    source: payload.source,
    dryRun: false,
    scanned: overdueUsers.length,
    finalized: 0,
    skipped: 0,
    failed: 0,
    failures: [] as Array<{ userId: string; step?: string; error: string }>,
  };

  for (const row of overdueUsers) {
    if (!row?.id) {
      summary.skipped += 1;
      continue;
    }

    const result = await finalizeSingleUser(adminClient, row, payload.source);
    if (result.ok) {
      summary.finalized += 1;
      console.log("[finalize-overdue-deletions] finalized_user", {
        runId,
        userId: row.id,
        source: payload.source,
        cleanup: result.cleanup || {},
      });
      continue;
    }

    summary.failed += 1;
    summary.failures.push({
      userId: result.userId,
      step: result.step,
      error: result.error || "Unknown finalization error",
    });

    console.error("[finalize-overdue-deletions] finalize_failed", {
      runId,
      userId: result.userId,
      source: payload.source,
      step: result.step,
      error: result.error || "Unknown finalization error",
    });

    await adminClient.rpc("log_admin_action", {
      p_action: "account_deletion_finalize_failed",
      p_actor_user_id: row.id,
      p_target_type: "user",
      p_target_id: row.id,
      p_meta: {
        actor_user_id: null,
        target_user_id: row.id,
        role: row.role || null,
        scheduled_purge_at: row.scheduled_purge_at || null,
        source: payload.source,
        result: "failed",
        step: result.step || null,
        error: result.error || "Unknown finalization error",
      },
    });
  }

  return json(summary);
}
