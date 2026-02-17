import Link from "next/link";
import AdminPage from "@/app/admin/_components/AdminPage";
import VerificationFilters from "@/app/admin/verification/_components/VerificationFilters";
import VerificationQueueTableClient from "@/app/admin/verification/_components/VerificationQueueTableClient";
import { hasExactAdminRole, requireAdminRole } from "@/lib/admin/permissions";
import {
  getCachedPendingBusinessVerificationsCount,
  listPendingBusinessVerifications,
  type VerificationQueueStatus,
} from "@/lib/admin/businessVerification";

const PAGE_SIZE = 20;
export const revalidate = 0;

function asString(value: string | string[] | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeStatus(value: string | string[] | undefined): VerificationQueueStatus {
  const status = asString(value, "pending").trim().toLowerCase();
  if (
    status === "pending" ||
    status === "verified" ||
    status === "suspended" ||
    status === "all" ||
    status === "auto_verified" ||
    status === "manually_verified"
  ) {
    return status;
  }
  return "pending";
}

function normalizePage(value: string | string[] | undefined) {
  const parsed = Number(asString(value, "1"));
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

function normalizeInternal(value: string | string[] | undefined): boolean | undefined {
  const normalized = asString(value).trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

function statusLabel(status: VerificationQueueStatus) {
  if (status === "pending") return "Pending";
  if (status === "verified") return "Verified";
  if (status === "suspended") return "Suspended";
  if (status === "manually_verified") return "Manually verified";
  if (status === "auto_verified") return "Auto verified";
  return "All";
}

export default async function AdminVerificationPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdminRole("admin_readonly");
  const params = (await searchParams) || {};
  const status = normalizeStatus(params.status);
  const q = asString(params.q).trim();
  const city = asString(params.city).trim();
  const page = normalizePage(params.page);
  const is_internal = normalizeInternal(params.is_internal);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const [{ rows, total_count }, pendingCount] = await Promise.all([
    listPendingBusinessVerifications({
      q,
      city,
      is_internal,
      from,
      to,
      status,
    }),
    getCachedPendingBusinessVerificationsCount(),
  ]);
  const canManage = hasExactAdminRole(admin.roles, "admin_super");
  const totalPages = Math.max(1, Math.ceil(total_count / PAGE_SIZE));
  const pageBase = new URLSearchParams();
  if (status !== "pending") pageBase.set("status", status);
  if (q) pageBase.set("q", q);
  if (city) pageBase.set("city", city);
  if (typeof is_internal === "boolean") pageBase.set("is_internal", String(is_internal));

  return (
    <AdminPage>
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Verification Queue</h2>
        <p className="text-sm text-neutral-400">
          Canonical workflow for reviewing business verification status changes.
        </p>
      </header>

      <VerificationFilters pendingCount={pendingCount} />

      <div className="flex items-center justify-between text-sm text-neutral-400">
        <p>
          Showing {rows.length} of {total_count} records ({statusLabel(status)}).
        </p>
        {canManage ? null : <p>Read-only mode. `admin_super` required for actions.</p>}
      </div>

      <VerificationQueueTableClient initialRows={rows} activeStatus={status} canManage={canManage} />

      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-400">
          Page {page} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              href={`/admin/verification?${new URLSearchParams({
                ...Object.fromEntries(pageBase),
                page: String(page - 1),
              }).toString()}`}
              className="rounded border border-neutral-700 px-3 py-1 text-sm hover:border-neutral-500"
            >
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={`/admin/verification?${new URLSearchParams({
                ...Object.fromEntries(pageBase),
                page: String(page + 1),
              }).toString()}`}
              className="rounded border border-neutral-700 px-3 py-1 text-sm hover:border-neutral-500"
            >
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </AdminPage>
  );
}
