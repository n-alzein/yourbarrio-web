"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import BusinessVerificationActionsClient from "@/app/admin/verification/_components/BusinessVerificationActionsClient";
import type {
  BusinessVerificationStatus,
  PendingBusinessVerificationRow,
  VerificationQueueStatus,
} from "@/lib/admin/businessVerification";

type VerificationQueueTableClientProps = {
  initialRows: PendingBusinessVerificationRow[];
  activeStatus: VerificationQueueStatus;
  canManage: boolean;
};

function formatRelativeTime(value: string | null) {
  if (!value) return "-";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "-";
  const diffSeconds = Math.round((then - Date.now()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 24 * 3600],
    ["month", 30 * 24 * 3600],
    ["week", 7 * 24 * 3600],
    ["day", 24 * 3600],
    ["hour", 3600],
    ["minute", 60],
  ];
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, seconds] of units) {
    if (Math.abs(diffSeconds) >= seconds) {
      return rtf.format(Math.round(diffSeconds / seconds), unit);
    }
  }
  return "just now";
}

function statusBadgeClass(status: BusinessVerificationStatus) {
  if (status === "manually_verified") {
    return "border-emerald-700/60 bg-emerald-950/60 text-emerald-100";
  }
  if (status === "auto_verified") {
    return "border-sky-700/60 bg-sky-950/60 text-sky-100";
  }
  if (status === "suspended") {
    return "border-rose-700/60 bg-rose-950/60 text-rose-100";
  }
  return "border-amber-700/60 bg-amber-950/60 text-amber-100";
}

export default function VerificationQueueTableClient({
  initialRows,
  activeStatus,
  canManage,
}: VerificationQueueTableClientProps) {
  const [rows, setRows] = useState(initialRows);

  const emptyLabel = useMemo(() => {
    if (activeStatus === "pending") return "No pending verifications.";
    if (activeStatus === "verified") return "No verified businesses found.";
    if (activeStatus === "suspended") return "No suspended businesses found.";
    return "No businesses found for the current filters.";
  }, [activeStatus]);

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-neutral-400">
            <th className="px-3 py-2">Business</th>
            <th className="px-3 py-2">Owner</th>
            <th className="px-3 py-2">City</th>
            <th className="px-3 py-2">Created</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Stripe</th>
            <th className="px-3 py-2">Internal</th>
            <th className="px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const createdAtExact = row.created_at ? new Date(row.created_at).toLocaleString() : "-";
            return (
              <tr key={row.owner_user_id} className="border-t border-neutral-800 align-top">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/users/${encodeURIComponent(row.owner_user_id)}`}
                    className="text-sky-300 hover:text-sky-200"
                  >
                    {row.business_name || "Unnamed business"}
                  </Link>
                  <div className="mt-1 text-xs text-neutral-500">
                    {row.public_id ? `biz_${row.public_id}` : row.owner_user_id}
                  </div>
                  {row.category ? <div className="mt-1 text-xs text-neutral-400">{row.category}</div> : null}
                </td>
                <td className="px-3 py-2">{row.owner_email || "-"}</td>
                <td className="px-3 py-2">{row.city || "-"}</td>
                <td className="px-3 py-2">
                  <time title={createdAtExact}>{formatRelativeTime(row.created_at)}</time>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(
                      row.verification_status
                    )}`}
                  >
                    {row.verification_status}
                  </span>
                </td>
                <td className="px-3 py-2">{row.stripe_connected ? "Yes" : "No"}</td>
                <td className="px-3 py-2">{row.is_internal ? "Yes" : "No"}</td>
                <td className="px-3 py-2">
                  <BusinessVerificationActionsClient
                    ownerUserId={row.owner_user_id}
                    currentStatus={row.verification_status}
                    canManage={canManage}
                    compact
                    onStatusUpdated={(nextStatus) => {
                      setRows((previous) => {
                        if (activeStatus === "pending" && nextStatus !== "pending") {
                          return previous.filter((item) => item.owner_user_id !== row.owner_user_id);
                        }
                        return previous.map((item) =>
                          item.owner_user_id === row.owner_user_id
                            ? { ...item, verification_status: nextStatus }
                            : item
                        );
                      });
                    }}
                  />
                </td>
              </tr>
            );
          })}
          {!rows.length ? (
            <tr>
              <td colSpan={8} className="px-3 py-6 text-center text-neutral-400">
                {emptyLabel}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
