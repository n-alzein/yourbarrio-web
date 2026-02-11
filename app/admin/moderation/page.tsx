import Link from "next/link";
import {
  hideListingAndResolveModerationFlagAction,
  hideReviewAndResolveModerationFlagAction,
  takeModerationCaseAction,
  updateModerationFlagAction,
} from "@/app/admin/actions";
import AdminFlash from "@/app/admin/_components/AdminFlash";
import { requireAdminAnyRole } from "@/lib/admin/permissions";
import { getReasonLabel, getTargetLabel } from "@/lib/moderation/reasons";
import { getAdminDataClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 20;

type ModerationRow = {
  id: string;
  created_at: string;
  updated_at: string;
  status: "open" | "in_review" | "resolved" | "dismissed";
  reason: string;
  details: string | null;
  admin_notes: string | null;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  target_type: "user" | "business" | "listing" | "review";
  target_id: string;
  reporter_user_id: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
  target_label: string | null;
  target_subtext: string | null;
  meta: Record<string, any> | null;
  total_count: number;
};

function asString(value: string | string[] | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function truncate(value: string | null | undefined, max = 100) {
  const text = String(value || "").trim();
  if (!text) return "-";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

function statusBadgeClass(status: string) {
  if (status === "open") return "border-amber-600/50 bg-amber-950/60 text-amber-100";
  if (status === "in_review") return "border-sky-600/50 bg-sky-950/60 text-sky-100";
  if (status === "resolved") return "border-emerald-600/50 bg-emerald-950/60 text-emerald-100";
  return "border-neutral-600/50 bg-neutral-900 text-neutral-100";
}

export default async function AdminModerationPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminAnyRole(["admin_ops", "admin_super"]);
  const params = (await searchParams) || {};

  const q = asString(params.q).trim();
  const status = asString(params.status).trim().toLowerCase();
  const type = asString(params.type, "all").trim().toLowerCase();
  const selectedId = asString(params.flag).trim();
  const page = Math.max(1, Number(asString(params.page, "1")) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { client } = await getAdminDataClient();
  const { data, error } = await client.rpc("admin_list_moderation_flags", {
    p_type: type || "all",
    p_status: status || null,
    p_q: q || null,
    p_from: from,
    p_to: to,
  });

  const rows = (Array.isArray(data) ? data : []) as ModerationRow[];
  const count = rows.length ? Number(rows[0]?.total_count || rows.length) : 0;
  const totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));

  const selectedRow = selectedId ? rows.find((row) => row.id === selectedId) || null : null;

  const pageParams = new URLSearchParams();
  if (q) pageParams.set("q", q);
  if (status) pageParams.set("status", status);
  if (type && type !== "all") pageParams.set("type", type);
  if (selectedId) pageParams.set("flag", selectedId);

  const returnTo = `/admin/moderation?${new URLSearchParams({
    ...Object.fromEntries(pageParams),
    page: String(page),
  }).toString()}`;

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Moderation queue</h2>
        <p className="text-sm text-neutral-400">
          Review user reports across users, businesses, listings, and reviews.
        </p>
      </header>

      <AdminFlash searchParams={params} />

      <form className="grid gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3 md:grid-cols-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search reporter, target, reason"
          className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm md:col-span-2"
        />
        <select
          name="type"
          defaultValue={type}
          className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
        >
          <option value="all">Type: all</option>
          <option value="user">Users</option>
          <option value="business">Businesses</option>
          <option value="listing">Listings</option>
          <option value="review">Reviews</option>
        </select>
        <select
          name="status"
          defaultValue={status}
          className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
        >
          <option value="">Status: any</option>
          <option value="open">open</option>
          <option value="in_review">in_review</option>
          <option value="resolved">resolved</option>
          <option value="dismissed">dismissed</option>
        </select>
        <button
          type="submit"
          className="rounded bg-sky-600 px-3 py-2 text-sm font-medium hover:bg-sky-500 md:col-span-4"
        >
          Apply filters
        </button>
      </form>

      {error ? (
        <div className="rounded-lg border border-rose-700 bg-rose-950/60 p-4 text-sm text-rose-100">
          Failed to load moderation queue: {error.message}
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border border-neutral-800 bg-neutral-900">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-400">
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Reporter</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowHref = `/admin/moderation?${new URLSearchParams({
                  ...Object.fromEntries(pageParams),
                  page: String(page),
                  flag: row.id,
                }).toString()}`;

                return (
                  <tr key={row.id} className="border-t border-neutral-800 align-top">
                    <td className="px-3 py-2 text-neutral-300">
                      {row.created_at ? new Date(row.created_at).toLocaleString() : "-"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(
                          row.status
                        )}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-neutral-100">
                        {getTargetLabel(row.target_type)}: {row.target_label || "-"}
                      </div>
                      <div className="text-xs text-neutral-400">{truncate(row.target_subtext, 80)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-neutral-100">{getReasonLabel(row.reason)}</div>
                      <div className="text-xs text-neutral-400">{truncate(row.details, 90)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-neutral-100">{row.reporter_name || "User"}</div>
                      <div className="text-xs text-neutral-400">{row.reporter_email || "-"}</div>
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={rowHref}
                        className="rounded border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-neutral-400">
                    No moderation flags found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && !selectedRow ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-300">
          Selected flag is not on this page. Use filters to locate it.
        </div>
      ) : null}

      {selectedRow ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Flag detail</h3>
              <p className="mt-1 text-xs text-neutral-500 font-mono">{selectedRow.id}</p>
            </div>
            <span
              className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusBadgeClass(
                selectedRow.status
              )}`}
            >
              {selectedRow.status}
            </span>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-neutral-400">Target:</span>{" "}
                <span className="text-neutral-100">{getTargetLabel(selectedRow.target_type)} - {selectedRow.target_label || "-"}</span>
              </p>
              <p>
                <span className="text-neutral-400">Target details:</span>{" "}
                <span className="text-neutral-100">{selectedRow.target_subtext || "-"}</span>
              </p>
              <p>
                <span className="text-neutral-400">Reporter:</span>{" "}
                <span className="text-neutral-100">{selectedRow.reporter_name || "User"}</span>
                <span className="text-neutral-400"> ({selectedRow.reporter_email || "-"})</span>
              </p>
              <p>
                <span className="text-neutral-400">Reason:</span>{" "}
                <span className="text-neutral-100">{getReasonLabel(selectedRow.reason)}</span>
              </p>
              <p>
                <span className="text-neutral-400">Details:</span>{" "}
                <span className="text-neutral-100 whitespace-pre-wrap">{selectedRow.details || "-"}</span>
              </p>
            </div>

            <div className="space-y-2 text-sm">
              <p>
                <span className="text-neutral-400">Created:</span>{" "}
                <span className="text-neutral-100">
                  {selectedRow.created_at ? new Date(selectedRow.created_at).toLocaleString() : "-"}
                </span>
              </p>
              <p>
                <span className="text-neutral-400">Updated:</span>{" "}
                <span className="text-neutral-100">
                  {selectedRow.updated_at ? new Date(selectedRow.updated_at).toLocaleString() : "-"}
                </span>
              </p>
              <p>
                <span className="text-neutral-400">Reviewed by:</span>{" "}
                <span className="text-neutral-100">{selectedRow.reviewed_by_user_id || "-"}</span>
              </p>
              <p>
                <span className="text-neutral-400">Reviewed at:</span>{" "}
                <span className="text-neutral-100">
                  {selectedRow.reviewed_at ? new Date(selectedRow.reviewed_at).toLocaleString() : "-"}
                </span>
              </p>
              <p>
                <span className="text-neutral-400">Admin notes:</span>{" "}
                <span className="text-neutral-100 whitespace-pre-wrap">{selectedRow.admin_notes || "-"}</span>
              </p>
            </div>
          </div>

          <details className="mt-4 rounded border border-neutral-800 bg-neutral-950 p-3">
            <summary className="cursor-pointer text-xs text-neutral-400">Meta context</summary>
            <pre className="mt-2 overflow-auto text-xs text-neutral-300">
              {JSON.stringify(selectedRow.meta || {}, null, 2)}
            </pre>
          </details>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <form action={takeModerationCaseAction} className="rounded border border-neutral-800 bg-neutral-950 p-3">
              <input type="hidden" name="id" value={selectedRow.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button
                type="submit"
                className="w-full rounded bg-sky-600 px-3 py-2 text-sm font-medium hover:bg-sky-500"
              >
                Take case
              </button>
            </form>

            <form action={updateModerationFlagAction} className="rounded border border-neutral-800 bg-neutral-950 p-3 space-y-2">
              <input type="hidden" name="id" value={selectedRow.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <select
                name="status"
                defaultValue={selectedRow.status}
                className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
              >
                <option value="open">open</option>
                <option value="in_review">in_review</option>
                <option value="resolved">resolved</option>
                <option value="dismissed">dismissed</option>
              </select>
              <textarea
                name="adminNotes"
                rows={3}
                placeholder="Admin notes (optional)"
                defaultValue={selectedRow.admin_notes || ""}
                className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium hover:bg-emerald-500"
              >
                Save status and notes
              </button>
            </form>

            {selectedRow.target_type === "listing" ? (
              <form
                action={hideListingAndResolveModerationFlagAction}
                className="rounded border border-neutral-800 bg-neutral-950 p-3 space-y-2"
              >
                <input type="hidden" name="id" value={selectedRow.id} />
                <input type="hidden" name="targetId" value={selectedRow.target_id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <textarea
                  name="adminNotes"
                  rows={3}
                  placeholder="Hide action notes (optional)"
                  className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="w-full rounded bg-amber-600 px-3 py-2 text-sm font-medium hover:bg-amber-500"
                >
                  Hide listing and resolve
                </button>
              </form>
            ) : null}

            {selectedRow.target_type === "review" ? (
              <form
                action={hideReviewAndResolveModerationFlagAction}
                className="rounded border border-neutral-800 bg-neutral-950 p-3 space-y-2"
              >
                <input type="hidden" name="id" value={selectedRow.id} />
                <input type="hidden" name="targetId" value={selectedRow.target_id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <textarea
                  name="adminNotes"
                  rows={3}
                  placeholder="Hide action notes (optional)"
                  className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="w-full rounded bg-amber-600 px-3 py-2 text-sm font-medium hover:bg-amber-500"
                >
                  Hide review and resolve
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-400">
          Page {page} of {totalPages} ({count || 0} flags)
        </p>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link
              href={`/admin/moderation?${new URLSearchParams({
                ...Object.fromEntries(pageParams),
                page: String(page - 1),
              }).toString()}`}
              className="rounded border border-neutral-700 px-3 py-1 text-sm hover:border-neutral-500"
            >
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link
              href={`/admin/moderation?${new URLSearchParams({
                ...Object.fromEntries(pageParams),
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
