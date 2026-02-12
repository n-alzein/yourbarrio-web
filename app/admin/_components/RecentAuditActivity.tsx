"use client";

import Link from "next/link";
import { useState } from "react";

type AuditRow = {
  id: string;
  action: string | null;
  target_type: string | null;
  target_id: string | null;
  actor_user_id: string | null;
  created_at: string;
};

type AuditApiResponse = {
  rows: AuditRow[];
  page: number;
  hasMore: boolean;
};

type RecentAuditActivityProps = {
  initialRows: AuditRow[];
  initialHasMore: boolean;
  pageSize: number;
};

export default function RecentAuditActivity({
  initialRows,
  initialHasMore,
  pageSize,
}: RecentAuditActivityProps) {
  const [rows, setRows] = useState(initialRows);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPage(nextPage: number) {
    if (isLoading || nextPage < 1) return;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/dashboard-audit?page=${nextPage}&page_size=${pageSize}`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        throw new Error(`Failed to load page ${nextPage}`);
      }
      const payload = (await response.json()) as AuditApiResponse;
      setRows(Array.isArray(payload.rows) ? payload.rows : []);
      setPage(Number(payload.page || nextPage));
      setHasMore(Boolean(payload.hasMore));
    } catch (fetchError: any) {
      setError(fetchError?.message || "Failed to load audit activity");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mt-8 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium">Recent audit activity</h3>
        <Link href="/admin/audit" className="text-sm text-sky-300 hover:text-sky-200">
          View all
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-400">
              <th className="py-2 pr-3">Time</th>
              <th className="py-2 pr-3">Action</th>
              <th className="py-2 pr-3">Target</th>
              <th className="py-2 pr-3">Actor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-neutral-800">
                <td className="py-2 pr-3">{new Date(row.created_at).toLocaleString()}</td>
                <td className="py-2 pr-3">{row.action || "-"}</td>
                <td className="py-2 pr-3">
                  {row.target_type || "-"}:{row.target_id || "-"}
                </td>
                <td className="py-2 pr-3 font-mono text-xs">{row.actor_user_id || "system"}</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td className="py-3 text-neutral-400" colSpan={4}>
                  No audit records yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-sm text-neutral-400">
          Page {page}
          {isLoading ? " • Loading..." : ""}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => loadPage(page - 1)}
            disabled={page <= 1 || isLoading}
            className="rounded border border-neutral-700 px-3 py-1 text-sm hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => loadPage(page + 1)}
            disabled={!hasMore || isLoading}
            className="rounded border border-neutral-700 px-3 py-1 text-sm hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
