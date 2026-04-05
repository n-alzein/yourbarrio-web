"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  formatAuditActorDisplay,
  formatAuditEvent,
  formatAuditTargetDisplay,
  formatAuditTimestamp,
  type AdminAuditRow,
} from "@/lib/admin/auditEventFormat";

type UserAuditRow = AdminAuditRow & {
  relation: "actor" | "target" | "both" | null;
  total_count?: number;
};

type ApiResponse = {
  rows: UserAuditRow[];
  totalCount: number;
};

type AdminUserActivityPanelProps = {
  userId: string;
  initialRows: UserAuditRow[];
  initialTotalCount: number;
  pageSize?: number;
};

function relationBadgeClass(relation: string | null) {
  if (relation === "both") return "border-violet-700/60 bg-violet-950/60 text-violet-100";
  if (relation === "actor") return "border-sky-700/60 bg-sky-950/60 text-sky-100";
  return "border-emerald-700/60 bg-emerald-950/60 text-emerald-100";
}

function relationLabel(relation: string | null) {
  if (relation === "both") return "Both";
  if (relation === "actor") return "Actor";
  return "Target";
}

function toPrettyJson(value: unknown) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return "{}";
  }
}

function labelRow(label: string, value: string) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2 text-sm">
      <dt className="text-neutral-400">{label}</dt>
      <dd className="break-words text-neutral-100">{value || "-"}</dd>
    </div>
  );
}

export default function AdminUserActivityPanel({
  userId,
  initialRows,
  initialTotalCount,
  pageSize = 20,
}: AdminUserActivityPanelProps) {
  const [rows, setRows] = useState<UserAuditRow[]>(initialRows);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [includeActor, setIncludeActor] = useState(true);
  const [includeTarget, setIncludeTarget] = useState(true);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rawOpen, setRawOpen] = useState(false);

  const selectedRow = useMemo(
    () => (selectedId ? rows.find((row) => row.id === selectedId) || null : null),
    [rows, selectedId]
  );
  const selectedEvent = useMemo(
    () => (selectedRow ? formatAuditEvent(selectedRow) : null),
    [selectedRow]
  );

  async function fetchRows(nextOffset: number) {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams({
        offset: String(Math.max(0, nextOffset)),
        limit: String(pageSize),
        include_actor: includeActor ? "1" : "0",
        include_target: includeTarget ? "1" : "0",
      });

      if (q.trim()) query.set("q", q.trim());
      if (action.trim()) query.set("action", action.trim());

      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(userId)}/activity?${query.toString()}`,
        { cache: "no-store" }
      );
      const payload = (await response.json().catch(() => ({}))) as ApiResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load activity");
      }

      setRows(Array.isArray(payload.rows) ? payload.rows : []);
      setTotalCount(Number(payload.totalCount || 0));
      setOffset(Math.max(0, nextOffset));
      setSelectedId(null);
      setRawOpen(false);
    } catch (fetchError: any) {
      setError(fetchError?.message || "Failed to load activity");
    } finally {
      setIsLoading(false);
    }
  }

  const from = rows.length ? offset + 1 : 0;
  const to = rows.length ? offset + rows.length : 0;
  const hasPrevious = offset > 0;
  const hasNext = offset + pageSize < totalCount;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <h3 className="mb-2 font-medium">Activity</h3>

        <div className="grid gap-2 md:grid-cols-5">
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search action, actor, target"
            className="h-10 rounded border border-neutral-700 bg-neutral-950 px-3 text-sm md:col-span-2"
          />
          <input
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="Action"
            className="h-10 rounded border border-neutral-700 bg-neutral-950 px-3 text-sm"
          />
          <button
            type="button"
            onClick={() => setIncludeTarget((value) => !value)}
            className={`h-10 rounded border px-3 text-sm ${
              includeTarget
                ? "border-emerald-700/70 bg-emerald-950/40 text-emerald-100"
                : "border-neutral-700 bg-neutral-950 text-neutral-300"
            }`}
            data-testid="activity-toggle-target"
          >
            As target
          </button>
          <button
            type="button"
            onClick={() => setIncludeActor((value) => !value)}
            className={`h-10 rounded border px-3 text-sm ${
              includeActor
                ? "border-sky-700/70 bg-sky-950/40 text-sky-100"
                : "border-neutral-700 bg-neutral-950 text-neutral-300"
            }`}
            data-testid="activity-toggle-actor"
          >
            As actor
          </button>
          <button
            type="button"
            onClick={() => fetchRows(0)}
            disabled={isLoading || (!includeActor && !includeTarget)}
            className="yb-primary-button h-10 rounded px-3 text-sm font-medium text-white md:col-span-5"
            data-testid="activity-apply-filters"
          >
            {isLoading ? "Loading..." : "Apply filters"}
          </button>
        </div>

        {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}

        <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-400">
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Relation</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Summary</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Target</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const event = formatAuditEvent(row);
                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-t border-neutral-800 align-top hover:bg-neutral-800/60"
                    onClick={() => {
                      setSelectedId(row.id);
                      setRawOpen(false);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(row.id);
                        setRawOpen(false);
                      }
                    }}
                    data-testid="user-activity-row"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">{formatAuditTimestamp(row.created_at)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${relationBadgeClass(row.relation)}`} data-testid="user-activity-relation">
                        {relationLabel(row.relation)}
                      </span>
                    </td>
                    <td className="px-3 py-2" data-testid="user-activity-action">
                      <div>{event.title}</div>
                      <div className="text-xs text-neutral-500" data-testid="user-activity-action-raw">{row.action || "-"}</div>
                    </td>
                    <td className="px-3 py-2 text-neutral-300" data-testid="user-activity-summary">{event.summary}</td>
                    <td className="px-3 py-2" data-testid="user-activity-actor">
                      <div>{formatAuditActorDisplay(row)}</div>
                      <div className="font-mono text-xs text-neutral-500">{row.actor_user_id || "system"}</div>
                    </td>
                    <td className="px-3 py-2" data-testid="user-activity-target">
                      <div>{formatAuditTargetDisplay(row)}</div>
                      <div className="font-mono text-xs text-neutral-500">{(row.target_type || "target")}:{row.target_id || "-"}</div>
                    </td>
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-neutral-400" data-testid="user-activity-empty">
                    No activity found for this user yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm text-neutral-400" data-testid="user-activity-count">
            Showing {from}-{to} of {totalCount}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchRows(Math.max(0, offset - pageSize))}
              disabled={!hasPrevious || isLoading}
              className="rounded border border-neutral-700 px-3 py-1 text-sm hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => fetchRows(offset + pageSize)}
              disabled={!hasNext || isLoading}
              className="rounded border border-neutral-700 px-3 py-1 text-sm hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>

        <Link href="/admin/audit" className="mt-3 inline-block text-sm text-sky-300 hover:text-sky-200">
          Open global audit log
        </Link>
      </div>

      {selectedRow ? (
        <div className="fixed inset-0 z-[6000]" data-testid="user-activity-drawer">
          <button
            type="button"
            aria-label="Close activity details"
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              setSelectedId(null);
              setRawOpen(false);
            }}
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-[540px] overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-4 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-2 border-b border-neutral-800 pb-3">
              <div>
                <h4 className="text-lg font-semibold">{selectedEvent?.title || selectedRow.action || "Audit event"}</h4>
                <p className="text-xs text-neutral-400">{formatAuditTimestamp(selectedRow.created_at)}</p>
              </div>
              <button
                type="button"
                className="rounded border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500"
                onClick={() => {
                  setSelectedId(null);
                  setRawOpen(false);
                }}
              >
                Close
              </button>
            </div>

            <section className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <h5 className="font-medium">Summary</h5>
              <p className="text-sm text-neutral-200">{selectedEvent?.summary || selectedRow.action || "-"}</p>
            </section>

            <section className="mt-3 space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <h5 className="font-medium">Actor</h5>
              <dl className="space-y-1">
                {labelRow("Display", formatAuditActorDisplay(selectedRow))}
                {labelRow("ID", selectedRow.actor_user_id || "system")}
              </dl>
            </section>

            <section className="mt-3 space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <h5 className="font-medium">Target</h5>
              <dl className="space-y-1">
                {labelRow("Display", formatAuditTargetDisplay(selectedRow))}
                {labelRow("Type", selectedRow.target_type || "-")}
                {labelRow("ID", selectedRow.target_id || "-")}
              </dl>
            </section>

            <section className="mt-3 space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <h5 className="font-medium">Details</h5>
              <dl className="space-y-1">
                {(selectedEvent?.details || []).map((detail) => (
                  <div key={`${detail.label}:${detail.value}`}>
                    {labelRow(detail.label, detail.value)}
                  </div>
                ))}
                {!(selectedEvent?.details || []).length ? labelRow("Details", "No structured details available") : null}
              </dl>
            </section>

            <section className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <details
                open={rawOpen}
                onToggle={(event) => setRawOpen((event.currentTarget as HTMLDetailsElement).open)}
              >
                <summary className="cursor-pointer text-sm font-medium">Raw payload</summary>
                {rawOpen ? (
                  <pre className="mt-2 max-h-[320px] overflow-auto rounded border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300" data-testid="user-activity-raw-payload">
                    {toPrettyJson(selectedRow.meta)}
                  </pre>
                ) : null}
              </details>
            </section>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
