"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatAuditActorDisplay,
  formatAuditEvent,
  formatAuditTargetDisplay,
  formatAuditTimestamp,
  type AdminAuditRow,
} from "@/lib/admin/auditEventFormat";

type AuditLogTableClientProps = {
  rows: AdminAuditRow[];
};

function toPrettyJson(value: unknown) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return "{}";
  }
}

function labelRow(label: string, value: string) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-2 text-sm">
      <dt className="text-neutral-400">{label}</dt>
      <dd className="text-neutral-100 break-words">{value || "-"}</dd>
    </div>
  );
}

export default function AuditLogTableClient({ rows }: AuditLogTableClientProps) {
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

  useEffect(() => {
    if (!selectedRow) return;

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedId(null);
      }
    }

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [selectedRow]);

  if (!rows.length) {
    return (
      <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-400">
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={5} className="px-3 py-4 text-neutral-400">
                No audit rows found.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-400">
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const formatted = formatAuditEvent(row);

              return (
                <tr
                  key={row.id}
                  className="cursor-pointer border-t border-neutral-800 align-top hover:bg-neutral-800/60"
                  data-testid="audit-row"
                  onClick={() => {
                    setRawOpen(false);
                    setSelectedId(row.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setRawOpen(false);
                      setSelectedId(row.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <td className="px-3 py-2 whitespace-nowrap">{formatAuditTimestamp(row.created_at)}</td>
                  <td className="px-3 py-2" data-testid="audit-actor">
                    <div>{formatAuditActorDisplay(row)}</div>
                    <div className="font-mono text-xs text-neutral-500">{row.actor_user_id || "system"}</div>
                  </td>
                  <td className="px-3 py-2" data-testid="audit-action">
                    <div>{formatted.title}</div>
                    <div className="text-xs text-neutral-500">{row.action || "-"}</div>
                  </td>
                  <td className="px-3 py-2" data-testid="audit-target">
                    <div>{formatAuditTargetDisplay(row)}</div>
                    <div className="font-mono text-xs text-neutral-500">
                      {(row.target_type || "target")}:{row.target_id || "-"}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-neutral-300" data-testid="audit-summary">
                    {formatted.summary}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedRow ? (
        <div className="fixed inset-0 z-[6000]" data-testid="audit-drawer">
          <button
            type="button"
            aria-label="Close audit details"
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              setRawOpen(false);
              setSelectedId(null);
            }}
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-[540px] overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-4 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-2 border-b border-neutral-800 pb-3">
              <div>
                <h3 className="text-lg font-semibold">{selectedEvent?.title || selectedRow.action || "Audit event"}</h3>
                <p className="text-xs text-neutral-400">{formatAuditTimestamp(selectedRow.created_at)}</p>
              </div>
              <button
                type="button"
                className="rounded border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500"
                onClick={() => {
                  setRawOpen(false);
                  setSelectedId(null);
                }}
              >
                Close
              </button>
            </div>

            <section className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <h4 className="font-medium">Summary</h4>
              <p className="text-sm text-neutral-200">{selectedEvent?.summary || selectedRow.action || "-"}</p>
            </section>

            <section className="mt-3 space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <h4 className="font-medium">Actor</h4>
              <dl className="space-y-1">
                {labelRow("Display", formatAuditActorDisplay(selectedRow))}
                {labelRow("ID", selectedRow.actor_user_id || "system")}
              </dl>
            </section>

            <section className="mt-3 space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <h4 className="font-medium">Target</h4>
              <dl className="space-y-1">
                {labelRow("Display", formatAuditTargetDisplay(selectedRow))}
                {labelRow("Type", selectedRow.target_type || "-")}
                {labelRow("ID", selectedRow.target_id || "-")}
              </dl>
            </section>

            <section className="mt-3 space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <h4 className="font-medium">Details</h4>
              <dl className="space-y-1">
                {(selectedEvent?.details || []).map((detail) => (
                  <div key={`${detail.label}:${detail.value}`}>
                    {labelRow(detail.label, detail.value)}
                  </div>
                ))}
                {!(selectedEvent?.details || []).length
                  ? labelRow("Details", "No structured details available")
                  : null}
              </dl>
            </section>

            <section className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <details
                open={rawOpen}
                onToggle={(event) => setRawOpen((event.currentTarget as HTMLDetailsElement).open)}
              >
                <summary className="cursor-pointer text-sm font-medium">Raw payload</summary>
                {rawOpen ? (
                  <pre
                    className="mt-2 max-h-[320px] overflow-auto rounded border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-300"
                    data-testid="audit-raw-payload"
                  >
                    {toPrettyJson(selectedRow.meta)}
                  </pre>
                ) : null}
              </details>
            </section>
          </aside>
        </div>
      ) : null}
    </>
  );
}
