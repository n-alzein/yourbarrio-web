"use client";

import Link from "next/link";
import { useState } from "react";
import { MoreHorizontal } from "lucide-react";

type AdminBusinessListingRow = {
  id: string;
  public_id: string | null;
  title: string | null;
  raw_status: string | null;
  admin_hidden: boolean;
  is_internal: boolean;
  is_test: boolean | null;
};

type ModerationAction = "visibility" | "internal" | null;

type ToastState =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

function buildPublicHref(row: AdminBusinessListingRow) {
  if (!row.public_id) return null;
  if (row.admin_hidden || row.is_internal || row.is_test === true) return null;
  if (String(row.raw_status || "").trim().toLowerCase() !== "published") return null;
  return `/listings/${encodeURIComponent(row.public_id)}`;
}

function buildPreviewHref(row: AdminBusinessListingRow) {
  const ref = row.public_id || row.id;
  return `/business/listings/${encodeURIComponent(ref)}/preview`;
}

function buildAuditHref(row: AdminBusinessListingRow) {
  return `/admin/audit?q=${encodeURIComponent(row.public_id || row.id)}`;
}

export default function AdminListingActionsMenu({
  row,
  onUpdated,
}: {
  row: AdminBusinessListingRow;
  onUpdated: (nextRow: any) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<ModerationAction>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const isInternal = row.is_internal || row.is_test === true;
  const publicHref = buildPublicHref(row);
  const previewHref = buildPreviewHref(row);
  const auditHref = buildAuditHref(row);

  const moderationMeta =
    activeAction === "visibility"
      ? {
          title: row.admin_hidden ? "Restore marketplace visibility?" : "Hide from marketplace?",
          summary: row.admin_hidden
            ? "This will clear the admin-only moderation hide flag."
            : "This will set the admin-only moderation hide flag and remove the listing from all public surfaces.",
          buttonLabel: row.admin_hidden ? "Restore visibility" : "Hide from marketplace",
          payload: {
            action: "set_visibility",
            hidden: !row.admin_hidden,
            reason,
          },
        }
      : activeAction === "internal"
        ? {
            title: isInternal ? "Remove internal/test flag?" : "Mark as internal/test?",
            summary: isInternal
              ? "This will remove the internal/test exclusion flag."
              : "This will mark the listing as internal/test and exclude it from all public surfaces.",
            buttonLabel: isInternal ? "Remove internal/test flag" : "Mark internal/test",
            payload: {
              action: "set_internal",
              internal: !isInternal,
              reason,
            },
          }
        : null;

  async function submitModeration() {
    if (!moderationMeta) return;
    if (!reason.trim()) {
      setToast({ type: "error", message: "Reason is required." });
      return;
    }

    setPending(true);
    setToast(null);

    try {
      const response = await fetch(`/api/admin/listings/${row.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(moderationMeta.payload),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to update listing.");
      }

      if (payload?.row?.id) {
        onUpdated(payload.row);
      }

      setToast({ type: "success", message: payload?.message || "Listing updated." });
      setActiveAction(null);
      setReason("");
      setMenuOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update listing.";
      setToast({ type: "error", message });
    } finally {
      setPending(false);
    }
  }

  async function copyListingId() {
    try {
      await navigator.clipboard.writeText(row.public_id || row.id);
      setToast({ type: "success", message: "Listing ID copied." });
      setMenuOpen(false);
    } catch {
      setToast({ type: "error", message: "Failed to copy listing ID." });
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setToast(null);
          setMenuOpen((current) => !current);
        }}
        className="inline-flex items-center gap-1 rounded border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-200 hover:border-neutral-500"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
        Actions
      </button>

      {menuOpen ? (
        <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-neutral-800 bg-neutral-950 p-1 shadow-xl">
          <button
            type="button"
            onClick={() => {
              setActiveAction("visibility");
              setMenuOpen(false);
              setReason("");
            }}
            className="block w-full rounded px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-900"
          >
            {row.admin_hidden ? "Restore visibility" : "Hide from marketplace"}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveAction("internal");
              setMenuOpen(false);
              setReason("");
            }}
            className="block w-full rounded px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-900"
          >
            {isInternal ? "Remove internal/test flag" : "Mark internal/test"}
          </button>
          {publicHref ? (
            <Link
              href={publicHref}
              target="_blank"
              className="block rounded px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
            >
              View public page
            </Link>
          ) : null}
          <Link
            href={previewHref}
            target="_blank"
            className="block rounded px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
          >
            Open preview
          </Link>
          <Link
            href={auditHref}
            className="block rounded px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
          >
            Open audit log
          </Link>
          <button
            type="button"
            onClick={copyListingId}
            className="block w-full rounded px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-900"
          >
            Copy listing ID
          </button>
        </div>
      ) : null}

      {toast ? (
        <div
          className={`mt-2 rounded border px-3 py-2 text-xs ${
            toast.type === "success"
              ? "border-emerald-700/70 bg-emerald-950/50 text-emerald-100"
              : "border-rose-700/70 bg-rose-950/50 text-rose-100"
          }`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      ) : null}

      {moderationMeta ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl">
            <div className="mb-2 flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-neutral-100">{moderationMeta.title}</h3>
              <button
                type="button"
                onClick={() => !pending && setActiveAction(null)}
                className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500"
              >
                Cancel
              </button>
            </div>
            <p className="text-sm text-neutral-400">{moderationMeta.summary}</p>
            <div className="mt-3 rounded border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-300">
              Listing: <span className="font-medium text-neutral-100">{row.title || "Untitled listing"}</span>
            </div>

            <label className="mt-4 block text-sm text-neutral-200">
              Reason for action <span className="text-rose-300">*</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={4}
                maxLength={500}
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                placeholder="Required moderation reason"
              />
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !pending && setActiveAction(null)}
                disabled={pending}
                className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:border-neutral-500 disabled:opacity-60"
              >
                Back
              </button>
              <button
                type="button"
                onClick={submitModeration}
                disabled={pending || !reason.trim()}
                className="rounded border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-sm font-medium text-neutral-100 hover:border-neutral-500 disabled:opacity-60"
              >
                {pending ? "Updating..." : moderationMeta.buttonLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
