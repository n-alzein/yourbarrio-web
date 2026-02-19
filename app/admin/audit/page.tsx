import AdminFlash from "@/app/admin/_components/AdminFlash";
import AdminPage from "@/app/admin/_components/AdminPage";
import AuditLogTableClient from "@/app/admin/audit/_components/AuditLogTableClient";
import type { AdminAuditRow } from "@/lib/admin/auditEventFormat";
import { requireAdminRole } from "@/lib/admin/permissions";
import { getAdminDataClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 30;

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

  const { client } = await getAdminDataClient();
  const { data, error } = await client.rpc("admin_list_audit_logs", {
    p_q: q || null,
    p_action: action || null,
    p_from: fromDate ? `${fromDate}T00:00:00.000Z` : null,
    p_to: toDate ? `${toDate}T23:59:59.999Z` : null,
    p_offset: offset,
    p_limit: PAGE_SIZE,
  });

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
        <button type="submit" className="h-10 rounded bg-sky-600 px-3 text-sm font-medium hover:bg-sky-500 md:col-span-2">
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
