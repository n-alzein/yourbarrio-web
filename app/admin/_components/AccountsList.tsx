import Link from "next/link";
import AdminFlash from "@/app/admin/_components/AdminFlash";
import AccountsFiltersClient from "@/app/admin/_components/AccountsFiltersClient";
import { requireAdminRole } from "@/lib/admin/permissions";
import {
  fetchAdminUsers,
  type AdminUserRoleFilter,
} from "@/lib/admin/users";
import { getAdminDataClient } from "@/lib/supabase/admin";
import { getAdminUserUrl } from "@/lib/ids/publicRefs";

/**
 * Admin accounts list findings:
 * - Roles come from `users.role`; admin classification additionally uses `admin_role_members.role_key`
 *   and `users.is_internal` so internal staff are classified under Admins.
 * - Internal flag comes from `users.is_internal`.
 * - Previous filter bug was `customer = role != business`, which included admin/internal rows and broke subsets.
 */

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

type InternalFilter = "all" | "true" | "false";

type AccountsListProps = {
  title: string;
  description: string;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
  presetRole?: Exclude<AdminUserRoleFilter, "all">;
};

function asString(value: string | string[] | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeRoleFilter(
  value: string | string[] | undefined,
  presetRole?: Exclude<AdminUserRoleFilter, "all">
): AdminUserRoleFilter {
  if (presetRole) return presetRole;
  const role = asString(value, "all").trim().toLowerCase();
  if (role === "customer" || role === "business" || role === "admin") return role;
  return "all";
}

function normalizeInternalFilter(params: Record<string, string | string[] | undefined>): InternalFilter {
  const raw = asString(params.internal || params.is_internal, "all").trim().toLowerCase();
  if (raw === "true" || raw === "false") return raw;
  return "all";
}

function normalizePage(value: string | string[] | undefined) {
  const parsed = Number(asString(value, "1"));
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

function normalizePageSize(value: string | string[] | undefined) {
  const parsed = Number(asString(value, String(DEFAULT_PAGE_SIZE)));
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.floor(parsed));
}

function roleBadgeClass(role: AdminUserRoleFilter) {
  if (role === "admin") return "border-amber-700/60 bg-amber-950/70 text-amber-200";
  if (role === "business") return "border-sky-700/60 bg-sky-950/70 text-sky-200";
  return "border-emerald-700/60 bg-emerald-950/70 text-emerald-200";
}

export default async function AccountsList({
  title,
  description,
  basePath,
  searchParams,
  presetRole,
}: AccountsListProps) {
  await requireAdminRole("admin_readonly");
  const q = asString(searchParams.q).trim();
  const role = normalizeRoleFilter(searchParams.role, presetRole);
  const internal = normalizeInternalFilter(searchParams);
  const includeInternal =
    internal === "true" ? true : internal === "false" ? false : undefined;
  const page = normalizePage(searchParams.page);
  const pageSize = normalizePageSize(searchParams.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const diagEnabled =
    String(process.env.AUTH_GUARD_DIAG || "") === "1" ||
    String(process.env.NEXT_PUBLIC_AUTH_DIAG || "") === "1";

  const { client, usingServiceRole } = await getAdminDataClient({ mode: "service" });
  const { rows, count, error, diag } = await fetchAdminUsers({
    client,
    usingServiceRole,
    role,
    includeInternal,
    q,
    from,
    to,
  });

  if ((diagEnabled || process.env.NODE_ENV !== "production") && (error || diag?.probes)) {
    console.warn("[admin-accounts] list diagnostics", {
      usingServiceRole,
      path: diag?.path || null,
      queryError: error
        ? {
            code: error.code,
            message: error.message,
            details: error.details,
          }
        : null,
      diag,
      filters: {
        role,
        internal,
        q,
        from,
        to,
      },
    });
  }

  const totalPages = Math.max(1, Math.ceil((count || 0) / pageSize));

  const queryBase = new URLSearchParams();
  queryBase.set("role", role);
  queryBase.set("internal", internal);
  queryBase.set("pageSize", String(pageSize));
  if (q) queryBase.set("q", q);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-neutral-400">{description}</p>
      </header>

      <AdminFlash searchParams={searchParams} />

      {error ? (
        <div className="rounded-md border border-rose-700 bg-rose-950/70 px-3 py-2 text-sm text-rose-100">
          <p className="font-semibold">Accounts query failed</p>
          <p className="mt-1 text-xs">
            mode={usingServiceRole ? "service" : "actor"} path={diag?.path || "unknown"}
          </p>
          <p className="mt-1 text-xs">code={String(error.code || "unknown")}</p>
          <p className="mt-1 text-xs">message={String(error.message || "Unknown error")}</p>
          <p className="mt-1 text-xs">details={String(error.details || "-")}</p>
        </div>
      ) : null}
      {!error && rows.length > 0 && count < rows.length ? (
        <div className="rounded-md border border-amber-700 bg-amber-950/70 px-3 py-2 text-xs text-amber-100">
          Accounts count anomaly detected: `rows.length` exceeds `total_count`. Check admin list query diagnostics.
        </div>
      ) : null}

      <AccountsFiltersClient
        presetRole={presetRole}
        initialRole={role}
        initialInternal={internal}
        initialQuery={q}
        initialPageSize={pageSize}
      />

      <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
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
            {rows.map((user) => (
              <tr key={user.id} className="border-t border-neutral-800">
                <td className="px-3 py-2">
                  <Link href={getAdminUserUrl(user)} className="text-sky-300 hover:text-sky-200">
                    {user.full_name || user.business_name || user.id}
                  </Link>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="rounded border border-neutral-700 bg-neutral-950 px-2 py-0.5 text-xs text-neutral-300">
                      usr_{user.public_id || user.id.slice(0, 8)}
                    </code>
                    <details className="text-xs text-neutral-500">
                      <summary className="cursor-pointer">Internal ID</summary>
                      <code className="mt-1 block break-all text-neutral-400">{user.id}</code>
                    </details>
                  </div>
                </td>
                <td className="px-3 py-2">{user.email || "-"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${roleBadgeClass(
                      user.account_role
                    )}`}
                  >
                    {user.account_role}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                      user.is_internal
                        ? "border-amber-700/60 bg-amber-950/70 text-amber-200"
                        : "border-neutral-700 bg-neutral-950 text-neutral-300"
                    }`}
                  >
                    {user.is_internal ? "Yes" : "No"}
                  </span>
                </td>
                <td className="px-3 py-2">{user.city || "-"}</td>
                <td className="px-3 py-2">
                  {user.created_at ? new Date(user.created_at).toLocaleDateString() : "-"}
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-neutral-400">
                  No accounts found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-400">
          Page {page} of {totalPages} ({count || 0} accounts)
        </p>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link
              href={`${basePath}?${new URLSearchParams({
                ...Object.fromEntries(queryBase),
                page: String(page - 1),
              }).toString()}`}
              className="rounded border border-neutral-700 px-3 py-1 text-sm hover:border-neutral-500"
            >
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={`${basePath}?${new URLSearchParams({
                ...Object.fromEntries(queryBase),
                page: String(page + 1),
              }).toString()}`}
              className="rounded border border-neutral-700 px-3 py-1 text-sm hover:border-neutral-500"
            >
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
