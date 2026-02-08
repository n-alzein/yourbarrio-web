import Link from "next/link";
import AdminFlash from "@/app/admin/_components/AdminFlash";
import { fetchAdminUsers } from "@/lib/admin/users";
import { requireAdminRole } from "@/lib/admin/permissions";
import { getAdminDataClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 20;

function asString(value: string | string[] | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function displayRole(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "user") return "customer";
  return normalized;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminRole("admin_readonly");
  const params = (await searchParams) || {};
  const q = asString(params.q).trim();
  const role = asString(params.role).trim();
  // Admin views are global by default.
  // Do NOT apply implicit location filters (e.g. inherited `city` query params).
  const city = asString(params.admin_city).trim();
  const isInternal = asString(params.is_internal).trim();
  const createdFrom = asString(params.from).trim();
  const createdTo = asString(params.to).trim();
  const page = Math.max(1, Number(asString(params.page, "1")) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { client, usingServiceRole } = await getAdminDataClient({ mode: "service" });
  const includeInternal =
    isInternal === "true" ? true : isInternal === "false" ? false : undefined;
  const roleFilter = role === "customer" || role === "business" ? role : "all";
  const effectiveIncludeInternal =
    includeInternal === undefined && roleFilter === "customer" ? false : includeInternal;
  const { rows, count, diag } = await fetchAdminUsers({
    client,
    role: roleFilter,
    includeInternal: effectiveIncludeInternal,
    q,
    city,
    createdFrom,
    createdTo,
    from,
    to,
  });
  const diagEnabled =
    String(process.env.NEXT_PUBLIC_AUTH_DIAG || "") === "1" ||
    String(process.env.AUTH_GUARD_DIAG || "") === "1";
  if (diagEnabled) {
    const [businessVisible, customerVisible] = await Promise.all([
      client.from("users").select("id", { count: "exact", head: true }).eq("role", "business"),
      client.from("users").select("id", { count: "exact", head: true }).or("role.is.null,role.neq.business"),
    ]);
    console.warn("[admin-users] visibility counts", {
      usingServiceRole,
      businessCount: businessVisible.count || 0,
      customerLikeCount: customerVisible.count || 0,
      businessErr: businessVisible.error?.code || null,
      customerErr: customerVisible.error?.code || null,
    });
  }
  const totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));

  const pageParams = new URLSearchParams();
  if (q) pageParams.set("q", q);
  if (role) pageParams.set("role", role);
  if (city) pageParams.set("admin_city", city);
  if (isInternal) pageParams.set("is_internal", isInternal);
  if (createdFrom) pageParams.set("from", createdFrom);
  if (createdTo) pageParams.set("to", createdTo);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Users</h2>
        <p className="text-sm text-neutral-400">Directory view with search, filters, and pagination.</p>
      </header>

      <AdminFlash searchParams={params} />
      {diagEnabled && !rows?.length && diag ? (
        <div className="rounded-md border border-amber-700 bg-amber-950/70 px-3 py-2 text-xs text-amber-100">
          Users diagnostics: rpcUsed={String(Boolean(diag.rpcUsed))}
          {diag.rpcError ? `, rpcError=${diag.rpcError.code || "unknown"}` : ""}
          {diag.profilesProbeError ? `, profilesProbe=${diag.profilesProbeError.code || "unknown"}` : ""}
          {diag.profilesQueryError ? `, profilesQuery=${diag.profilesQueryError.code || "unknown"}` : ""}
          {typeof diag.profilesFirstPageCount === "number"
            ? `, profilesFirstPage=${diag.profilesFirstPageCount}`
            : ""}
        </div>
      ) : null}

      <form className="grid gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3 md:grid-cols-7">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, email, phone, business"
          className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm md:col-span-2"
        />
        <input name="role" defaultValue={role} placeholder="role" className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" />
        <input name="admin_city" defaultValue={city} placeholder="city" className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" />
        <select name="is_internal" defaultValue={isInternal} className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm">
          <option value="">is_internal: any</option>
          <option value="true">internal true</option>
          <option value="false">internal false</option>
        </select>
        <input type="date" name="from" defaultValue={createdFrom} className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" />
        <input type="date" name="to" defaultValue={createdTo} className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" />
        <div className="md:col-span-7">
          <button type="submit" className="rounded bg-sky-600 px-3 py-2 text-sm font-medium hover:bg-sky-500">
            Apply filters
          </button>
        </div>
      </form>

      <div className="overflow-auto rounded-lg border border-neutral-800 bg-neutral-900">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-400">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Internal</th>
              <th className="px-3 py-2">City</th>
              <th className="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((user: any) => (
              <tr key={user.id} className="border-t border-neutral-800">
                <td className="px-3 py-2">
                  <Link href={`/admin/users/${user.id}`} className="text-sky-300 hover:text-sky-200">
                    {user.full_name || user.business_name || user.id}
                  </Link>
                </td>
                <td className="px-3 py-2">{user.email || "-"}</td>
                <td className="px-3 py-2">{displayRole(user.role)}</td>
                <td className="px-3 py-2">{String(Boolean(user.is_internal))}</td>
                <td className="px-3 py-2">{user.city || "-"}</td>
                <td className="px-3 py-2">{user.created_at ? new Date(user.created_at).toLocaleDateString() : "-"}</td>
              </tr>
            ))}
            {!rows?.length ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-neutral-400">
                  No users found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-400">
          Page {page} of {totalPages} ({count || 0} users)
        </p>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link href={`/admin/users?${new URLSearchParams({ ...Object.fromEntries(pageParams), page: String(page - 1) }).toString()}`} className="rounded border border-neutral-700 px-3 py-1 text-sm hover:border-neutral-500">
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link href={`/admin/users?${new URLSearchParams({ ...Object.fromEntries(pageParams), page: String(page + 1) }).toString()}`} className="rounded border border-neutral-700 px-3 py-1 text-sm hover:border-neutral-500">
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
