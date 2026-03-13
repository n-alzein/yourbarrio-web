"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  targetUserId: string;
  scheduledPurgeAt: string | null;
  canRestore: boolean;
};

export default function AdminRestoreAccountButton({
  targetUserId,
  scheduledPurgeAt,
  canRestore,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canRestore) return null;

  async function handleRestore() {
    if (pending) return;
    setPending(true);
    setError(null);
    setToast(null);
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(targetUserId)}/restore`,
        {
          method: "POST",
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || "Failed to restore account"));
      }
      setToast("Account restored.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-700/70 bg-amber-950/50 p-3">
      <p className="text-sm font-semibold text-amber-200">Account is pending deletion</p>
      <p className="mt-1 text-xs text-amber-100/90">
        Scheduled purge: {scheduledPurgeAt ? formatUsDateTime(scheduledPurgeAt) : "-"}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleRestore}
          disabled={pending}
          className="rounded border border-emerald-700 bg-emerald-950 px-3 py-1.5 text-sm text-emerald-100 hover:border-emerald-500 disabled:opacity-60"
        >
          {pending ? "Restoring..." : "Restore account"}
        </button>
        {error ? <span className="text-xs text-rose-300">{error}</span> : null}
        {toast ? <span className="text-xs text-emerald-300">{toast}</span> : null}
      </div>
    </div>
  );
}

function formatUsDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
