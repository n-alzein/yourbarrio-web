import Link from "next/link";
import AdminFlash from "@/app/admin/_components/AdminFlash";
import { requireAdminRole } from "@/lib/admin/permissions";
import { getAdminDataClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 20;

function asString(value: string | string[] | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export default async function AdminBusinessesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminRole("admin_readonly");
  const params = (await searchParams) || {};
  const q = asString(params.q).trim();
  // Admin views are global by default.
  // Do NOT apply implicit location filters (e.g. inherited `city` query params).
  const city = asString(params.admin_city).trim();
  const page = Math.max(1, Number(asString(params.page, "1")) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { client } = await getAdminDataClient();
  let query = client
    .from("users")
    .select("id, email, full_name, business_name, category, city, phone, website, created_at, role", {
      count: "exact",
    })
    .or("role.eq.business,business_name.not.is.null")
    .order("created_at", { ascending: false });

  if (q) {
    query = query.or(
      `business_name.ilike.%${q}%,full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`
    );
  }
  if (city) query = query.ilike("city", `%${city}%`);

  const { data: rows, count } = await query.range(from, to);
  const totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));

  const pageParams = new URLSearchParams();
  if (q) pageParams.set("q", q);
  if (city) pageParams.set("admin_city", city);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Businesses</h2>
        <p className="text-sm text-neutral-400">Business directory across users profiles.</p>
      </header>

      <AdminFlash searchParams={params} />

      <form className="grid gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3 md:grid-cols-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search business, owner, email, phone"
          className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
        />
        <input name="admin_city" defaultValue={city} placeholder="city" className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm" />
        <button type="submit" className="rounded bg-sky-600 px-3 py-2 text-sm font-medium hover:bg-sky-500">
          Apply filters
        </button>
      </form>

      <div className="overflow-auto rounded-lg border border-neutral-800 bg-neutral-900">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-400">
              <th className="px-3 py-2">Business</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">City</th>
              <th className="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((row: any) => (
              <tr key={row.id} className="border-t border-neutral-800">
                <td className="px-3 py-2">
                  <Link href={`/admin/users/${row.id}`} className="text-sky-300 hover:text-sky-200">
                    {row.business_name || row.full_name || row.id}
                  </Link>
                </td>
                <td className="px-3 py-2">{row.full_name || "-"}</td>
                <td className="px-3 py-2">{row.email || "-"}</td>
                <td className="px-3 py-2">{row.category || "-"}</td>
                <td className="px-3 py-2">{row.city || "-"}</td>
                <td className="px-3 py-2">{row.created_at ? new Date(row.created_at).toLocaleDateString() : "-"}</td>
              </tr>
            ))}
            {!rows?.length ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-neutral-400">
                  No businesses found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-400">
          Page {page} of {totalPages} ({count || 0} businesses)
        </p>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link href={`/admin/businesses?${new URLSearchParams({ ...Object.fromEntries(pageParams), page: String(page - 1) }).toString()}`} className="rounded border border-neutral-700 px-3 py-1 text-sm hover:border-neutral-500">
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link href={`/admin/businesses?${new URLSearchParams({ ...Object.fromEntries(pageParams), page: String(page + 1) }).toString()}`} className="rounded border border-neutral-700 px-3 py-1 text-sm hover:border-neutral-500">
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
