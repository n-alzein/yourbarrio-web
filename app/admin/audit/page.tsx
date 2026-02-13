import AdminFlash from "@/app/admin/_components/AdminFlash";
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
  const action = asString(params.action).trim();
  const actor = asString(params.actor).trim();
  const targetType = asString(params.target_type).trim();
  const fromDate = asString(params.from).trim();
  const toDate = asString(params.to).trim();
  const page = Math.max(1, Number(asString(params.page, "1")) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { client } = await getAdminDataClient();
  let query = client
    .from("admin_audit_log")
    .select("id, actor_user_id, action, target_type, target_id, meta, created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  if (action) query = query.ilike("action", `%${action}%`);
  if (actor) query = query.eq("actor_user_id", actor);
  if (targetType) query = query.ilike("target_type", `%${targetType}%`);
  if (fromDate) query = query.gte("created_at", `${fromDate}T00:00:00.000Z`);
  if (toDate) query = query.lte("created_at", `${toDate}T23:59:59.999Z`);

  const { data: rows, count } = await query.range(from, to);
  const totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));

  const pageParams = new URLSearchParams();
  if (action) pageParams.set("action", action);
  if (actor) pageParams.set("actor", actor);
  if (targetType) pageParams.set("target_type", targetType);
  if (fromDate) pageParams.set("from", fromDate);
  if (toDate) pageParams.set("to", toDate);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Audit log</h2>
        <p className="text-sm text-neutral-400">All admin mutations and support-mode activity.</p>
      </header>

      <AdminFlash searchParams={params} />

      <form className="grid gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3 md:grid-cols-5">
        <input name="action" defaultValue={action} placeholder="action" className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" />
        <input name="actor" defaultValue={actor} placeholder="actor_user_id" className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" />
        <input name="target_type" defaultValue={targetType} placeholder="target_type" className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="date" name="from" defaultValue={fromDate} className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="date" name="to" defaultValue={toDate} className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" />
        <button type="submit" className="rounded bg-sky-600 px-3 py-2 text-sm font-medium hover:bg-sky-500 md:col-span-5">
          Apply filters
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-400">
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Meta</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((row: any) => (
              <tr key={row.id} className="border-t border-neutral-800 align-top">
                <td className="px-3 py-2 whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.actor_user_id || "system"}</td>
                <td className="px-3 py-2">{row.action}</td>
                <td className="px-3 py-2">{row.target_type || "-"}:{row.target_id || "-"}</td>
                <td className="px-3 py-2">
                  <pre className="max-w-xl overflow-x-auto whitespace-pre-wrap text-xs text-neutral-400">
                    {JSON.stringify(row.meta || {}, null, 2)}
                  </pre>
                </td>
              </tr>
            ))}
            {!rows?.length ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-neutral-400">
                  No audit rows found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-400">
          Page {page} of {totalPages} ({count || 0} rows)
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
    </section>
  );
}
