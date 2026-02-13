"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

type AdminUserSecurityActionsProps = {
  targetUserId: string;
  currentEmail: string | null;
  canManageSecurity: boolean;
};

type ModalType = "email" | "reset" | null;

type ToastState =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

const MIN_REASON_LENGTH = 10;

export default function AdminUserSecurityActions({
  targetUserId,
  currentEmail,
  canManageSecurity,
}: AdminUserSecurityActionsProps) {
  const router = useRouter();
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [newEmail, setNewEmail] = useState(currentEmail || "");
  const [reason, setReason] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const reasonTooShort = useMemo(() => reason.trim().length < MIN_REASON_LENGTH, [reason]);
  const canSubmitEmail = useMemo(
    () => !reasonTooShort && Boolean(newEmail.trim()),
    [reasonTooShort, newEmail]
  );
  const canSubmitReset = useMemo(
    () => !reasonTooShort && Boolean((currentEmail || "").trim()),
    [reasonTooShort, currentEmail]
  );

  if (!canManageSecurity) return null;

  function closeModal() {
    setActiveModal(null);
    setReason("");
  }

  async function handleUpdateEmail() {
    setIsPending(true);
    setToast(null);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(targetUserId)}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newEmail: newEmail.trim(),
          reason: reason.trim(),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || "Failed to update email"));
      }

      setToast({ type: "success", message: "User email updated." });
      closeModal();
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected email update error";
      setToast({ type: "error", message });
    } finally {
      setIsPending(false);
    }
  }

  async function handleSendPasswordReset() {
    setIsPending(true);
    setToast(null);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(targetUserId)}/password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetEmail: String(currentEmail || "").trim(),
          reason: reason.trim(),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(payload?.error || "Failed to send password reset"));
      }

      setToast({ type: "success", message: "Password reset email triggered." });
      closeModal();
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected password reset error";
      setToast({ type: "error", message });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <h3 className="mb-2 font-medium">Security</h3>
        <p className="mb-3 text-sm text-neutral-400">Sensitive actions available to admin_super only.</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded border border-neutral-800 bg-neutral-950/60 p-3">
            <div>
              <p className="text-sm font-medium text-neutral-100">Change email</p>
              <p className="text-xs text-neutral-400">Update the auth email for this user account.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setNewEmail(currentEmail || "");
                setReason("");
                setActiveModal("email");
              }}
              className="rounded border border-sky-700/70 bg-sky-950/40 px-3 py-2 text-sm text-sky-200 hover:border-sky-500"
            >
              Change email
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 rounded border border-neutral-800 bg-neutral-950/60 p-3">
            <div>
              <p className="text-sm font-medium text-neutral-100">Send password reset</p>
              <p className="text-xs text-neutral-400">Send a secure reset link; no admin password editing.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setReason("");
                setActiveModal("reset");
              }}
              className="rounded border border-amber-700/70 bg-amber-950/40 px-3 py-2 text-sm text-amber-200 hover:border-amber-500"
            >
              Send password reset
            </button>
          </div>
        </div>
      </div>

      {activeModal === "email" ? (
        <ModalShell
          title="Update user email?"
          description="This action updates the sign-in email for this account and will be logged."
          onClose={closeModal}
        >
          <label className="block text-sm text-neutral-200">
            New email
            <input
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
              placeholder="user@example.com"
              autoComplete="off"
            />
          </label>

          <ReasonInput reason={reason} setReason={setReason} />

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeModal}
              disabled={isPending}
              className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:border-neutral-500 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUpdateEmail}
              disabled={isPending || !canSubmitEmail}
              className="rounded border border-sky-700 bg-sky-900 px-3 py-1.5 text-sm font-medium text-sky-100 hover:border-sky-500 disabled:opacity-60"
            >
              {isPending ? "Updating..." : "Update email"}
            </button>
          </div>
        </ModalShell>
      ) : null}

      {activeModal === "reset" ? (
        <ModalShell
          title="Send password reset email?"
          description="This will send a password recovery email to the current user email."
          onClose={closeModal}
        >
          <div className="rounded border border-neutral-800 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-300">
            Current email: <span className="font-mono">{currentEmail || "-"}</span>
          </div>

          <ReasonInput reason={reason} setReason={setReason} />

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeModal}
              disabled={isPending}
              className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:border-neutral-500 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSendPasswordReset}
              disabled={isPending || !canSubmitReset}
              className="rounded border border-amber-700 bg-amber-900 px-3 py-1.5 text-sm font-medium text-amber-100 hover:border-amber-500 disabled:opacity-60"
            >
              {isPending ? "Sending..." : "Send reset email"}
            </button>
          </div>
        </ModalShell>
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

function ReasonInput({
  reason,
  setReason,
}: {
  reason: string;
  setReason: (next: string) => void;
}) {
  return (
    <label className="mt-3 block text-sm text-neutral-200">
      Reason <span className="text-red-300">*</span>
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        required
        rows={4}
        minLength={MIN_REASON_LENGTH}
        maxLength={500}
        className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
        placeholder="Required reason for this security action (10-500 chars)"
      />
      <span className="mt-1 block text-xs text-neutral-500">{reason.trim().length}/500</span>
    </label>
  );
}

function ModalShell({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-neutral-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300 hover:border-neutral-500"
            aria-label="Close modal"
          >
            Close
          </button>
        </div>
        <p className="text-sm text-neutral-400">{description}</p>
        {children}
      </div>
    </div>
  );
}
