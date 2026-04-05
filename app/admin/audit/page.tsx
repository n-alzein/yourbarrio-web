import AdminFlash from "@/app/admin/_components/AdminFlash";
import AdminPage from "@/app/admin/_components/AdminPage";
import AuditLogTableClient from "@/app/admin/audit/_components/AuditLogTableClient";
import type { AdminAuditRow } from "@/lib/admin/auditEventFormat";
import { requireAdminRole } from "@/lib/admin/permissions";
import { getAdminDataClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 30;
const STAGING_AUDIT_LOGS_ENABLED =
  process.env.NEXT_PUBLIC_VERCEL_ENV === "preview" ||
  process.env.VERCEL_ENV !== "production";

function asString(value: string | string[] | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminRole("admin_readonly");
  const params = (await searchParams) || {};
  const q = asString(params.q).trim();
  const action = asString(params.action).trim();
  const fromDate = asString(params.from).trim();
  const toDate = asString(params.to).trim();
  const page = Math.max(1, Number(asString(params.page, "1")) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const userId = asString(params.userId).trim() || asString(params.user_id).trim();
  const targetId = asString(params.targetId).trim() || asString(params.target_id).trim();
  const actorId = asString(params.actorId).trim() || asString(params.actor_id).trim();

  const rpcParams = {
    p_q: q || null,
    p_action: action || null,
    p_from: fromDate ? `${fromDate}T00:00:00.000Z` : null,
    p_to: toDate ? `${toDate}T23:59:59.999Z` : null,
    p_offset: offset,
    p_limit: PAGE_SIZE,
  };

  const debugContext = {
    route: "/admin/audit",
    isServer: typeof window === "undefined",
    q,
    action,
    from: fromDate,
    to: toDate,
    userId,
    targetId,
    actorId,
    offset,
    limit: PAGE_SIZE,
  };

  if (STAGING_AUDIT_LOGS_ENABLED) {
    console.warn("[audit-debug] /admin/audit incoming search params", {
      route: "/admin/audit",
      isServer: typeof window === "undefined",
      raw: {
        q: asString(params.q),
        action: asString(params.action),
        from: asString(params.from),
        to: asString(params.to),
        userId: asString(params.userId),
        user_id: asString(params.user_id),
        targetId: asString(params.targetId),
        target_id: asString(params.target_id),
        actorId: asString(params.actorId),
        actor_id: asString(params.actor_id),
        page: asString(params.page, "1"),
      },
      derived: {
        userId,
        targetId,
        actorId,
      },
    });
  }

  const { client } = await getAdminDataClient();
  let data: unknown = null;
  let error: { message?: string } | null = null;

  try {
    if (STAGING_AUDIT_LOGS_ENABLED) {
      const emptyUuidFields = [
        ["userId", userId],
        ["targetId", targetId],
        ["actorId", actorId],
      ]
        .filter(([, value]) => value === "")
        .map(([name]) => name);

      console.warn("[audit-debug] before rpc admin_list_audit_logs", {
        ...debugContext,
        rpc: "admin_list_audit_logs",
        rpcParams,
        emptyUuidFields,
      });
    }

    const result = await client.rpc("admin_list_audit_logs", rpcParams);
    data = result.data;
    error = result.error;

    if (STAGING_AUDIT_LOGS_ENABLED && result.error) {
      console.error("[audit-debug] rpc admin_list_audit_logs returned error", {
        ...debugContext,
        rpc: "admin_list_audit_logs",
        params: rpcParams,
        errorMessage: result.error.message || "Unknown error",
        errorCode: result.error.code || null,
      });
    }
  } catch (caughtError: any) {
    if (STAGING_AUDIT_LOGS_ENABLED) {
      console.error("[audit-debug] rpc admin_list_audit_logs threw", {
        ...debugContext,
        rpc: "admin_list_audit_logs",
        params: rpcParams,
        errorMessage: caughtError?.message || "Unknown error",
      });
    }
    error = { message: caughtError?.message || "Unknown error" };
  }

  const rows = (Array.isArray(data) ? data : []) as AdminAuditRow[];
  const totalRows = rows.length ? Number(rows[0]?.total_count || 0) : 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  const pageParams = new URLSearchParams();
  if (q) pageParams.set("q", q);
  if (action) pageParams.set("action", action);
  if (fromDate) pageParams.set("from", fromDate);
  if (toDate) pageParams.set("to", toDate);

  return (
    <AdminPage>
      <header>
        <h2 className="text-xl font-semibold">Audit log</h2>
        <p className="text-sm text-neutral-400">All admin mutations and support-mode activity.</p>
      </header>

      <AdminFlash searchParams={params} />

      <form className="grid gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3 md:grid-cols-5">
        <input name="q" defaultValue={q} placeholder="search action, actor, target" className="h-10 rounded border border-neutral-700 bg-neutral-950 px-3 text-sm md:col-span-2" />
        <input name="action" defaultValue={action} placeholder="action" className="h-10 rounded border border-neutral-700 bg-neutral-950 px-3 text-sm" />
        <input type="date" name="from" defaultValue={fromDate} className="h-10 rounded border border-neutral-700 bg-neutral-950 px-3 text-sm" />
        <input type="date" name="to" defaultValue={toDate} className="h-10 rounded border border-neutral-700 bg-neutral-950 px-3 text-sm" />
        <button type="submit" className="yb-primary-button h-10 rounded px-3 text-sm font-medium text-white md:col-span-2">
          Apply filters
        </button>
      </form>

      {error ? (
        <div className="rounded border border-rose-700 bg-rose-950/60 p-3 text-sm text-rose-100">
          Failed to load audit log: {error.message || "Unknown error"}
        </div>
      ) : null}

      <AuditLogTableClient rows={rows} />

      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-400">
          Page {page} of {totalPages} ({totalRows} rows)
        </p>
        <div className="flex gap-2">
          {page > 1 ? (
            <a href={`/admin/audit?${new URLSearchParams({ ...Object.fromEntries(pageParams), page: String(page - 1) }).toString()}`} className="rounded border border-neutral-700 px-3 py-1 text-sm hover:border-neutral-500">
              Previous
            </a>
          ) : null}
          {page < totalPages ? (
            <a href={`/admin/audit?${new URLSearchParams({ ...Object.fromEntries(pageParams), page: String(page + 1) }).toString()}`} className="rounded border border-neutral-700 px-3 py-1 text-sm hover:border-neutral-500">
              Next
            </a>
          ) : null}
        </div>
      </div>
    </AdminPage>
  );
}
