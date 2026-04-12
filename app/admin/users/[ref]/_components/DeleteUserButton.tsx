"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DeleteUserButtonProps = {
  targetUserId: string;
  actorRoleKeys?: string[] | null;
};

type ToastState =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

export default function DeleteUserButton({
  targetUserId,
  actorRoleKeys,
}: DeleteUserButtonProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  // UI gating is convenience only; API route enforces admin_super server-side.
  const roles = Array.isArray(actorRoleKeys) ? actorRoleKeys : [];
  const canDelete = roles.includes("admin_super");
  if (!canDelete) return null;

  async function handleConfirmDelete() {
    setIsPending(true);
    setToast(null);
    try {
      const response = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: targetUserId }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || "Failed to delete user"));
      }

      setToast({ type: "success", message: "User scheduled for deletion." });
      setIsModalOpen(false);
      router.push("/admin/accounts");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected deletion error";
      setToast({ type: "error", message });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        disabled={isPending}
        className="rounded border border-rose-700/70 bg-rose-950/60 px-3 py-2 text-sm font-medium text-rose-200 hover:border-rose-500 disabled:opacity-60"
      >
        Schedule Deletion
      </button>

      {isModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`delete-user-title-${targetUserId}`}
        >
          <div className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl">
            <h3
              id={`delete-user-title-${targetUserId}`}
              className="text-base font-semibold text-neutral-100"
            >
              Schedule this user for deletion?
            </h3>
            <p className="mt-2 text-sm text-neutral-300">
              This starts the 30-day pending deletion window. Finalization happens later.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isPending}
                className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:border-neutral-500 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isPending}
                className="rounded border border-rose-700 bg-rose-900 px-3 py-1.5 text-sm font-medium text-rose-100 hover:border-rose-500 disabled:opacity-60"
              >
                {isPending ? "Scheduling..." : "Schedule deletion"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          className={`fixed bottom-4 right-4 z-50 rounded border px-3 py-2 text-sm shadow-lg ${
            toast.type === "success"
              ? "border-emerald-700 bg-emerald-950 text-emerald-100"
              : "border-rose-700 bg-rose-950 text-rose-100"
          }`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      ) : null}
    </>
  );
}
