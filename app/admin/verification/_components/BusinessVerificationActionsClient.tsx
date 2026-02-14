"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveBusiness, resetBusiness, suspendBusiness } from "@/app/admin/verification/actions";
import type { BusinessVerificationStatus } from "@/lib/admin/businessVerification";

type ToastState =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

type BusinessVerificationActionsClientProps = {
  ownerUserId: string;
  currentStatus: BusinessVerificationStatus;
  canManage: boolean;
  compact?: boolean;
  onStatusUpdated?: (nextStatus: BusinessVerificationStatus) => void;
};

const ACTION_META = {
  approve: {
    confirm: "Approve this business verification?",
    success: "Business approved.",
    busy: "Approving...",
  },
  suspend: {
    confirm: "Suspend this business?",
    success: "Business suspended.",
    busy: "Suspending...",
  },
  reset: {
    confirm: "Reset this business to pending verification?",
    success: "Business reset to pending.",
    busy: "Resetting...",
  },
} as const;

export default function BusinessVerificationActionsClient({
  ownerUserId,
  currentStatus,
  canManage,
  compact = false,
  onStatusUpdated,
}: BusinessVerificationActionsClientProps) {
  const router = useRouter();
  const [activeAction, setActiveAction] = useState<"approve" | "suspend" | "reset" | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [isPending, startTransition] = useTransition();

  if (!canManage) {
    return <span className="text-xs text-neutral-500">admin_super required</span>;
  }

  function runAction(action: "approve" | "suspend" | "reset") {
    if (!window.confirm(ACTION_META[action].confirm)) return;
    setToast(null);
    setActiveAction(action);
    startTransition(async () => {
      const result =
        action === "approve"
          ? await approveBusiness(ownerUserId)
          : action === "suspend"
            ? await suspendBusiness(ownerUserId)
            : await resetBusiness(ownerUserId);

      setActiveAction(null);
      if (!result.ok) {
        setToast({
          type: "error",
          message: ("error" in result ? result.error : "") || "Failed to update verification status.",
        });
        return;
      }

      const nextStatus =
        action === "approve"
          ? ("manually_verified" as const)
          : action === "suspend"
            ? ("suspended" as const)
            : ("pending" as const);
      onStatusUpdated?.(nextStatus);
      setToast({ type: "success", message: ACTION_META[action].success });
      router.refresh();
    });
  }

  const buttonClass = compact
    ? "rounded border px-2 py-1 text-xs"
    : "rounded border px-2.5 py-1.5 text-xs";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => runAction("approve")}
          className={`${buttonClass} border-emerald-700 bg-emerald-950/60 text-emerald-100 hover:border-emerald-500 disabled:opacity-60`}
        >
          {activeAction === "approve" ? ACTION_META.approve.busy : "Approve"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => runAction("suspend")}
          className={`${buttonClass} border-rose-700 bg-rose-950/60 text-rose-100 hover:border-rose-500 disabled:opacity-60`}
        >
          {activeAction === "suspend" ? ACTION_META.suspend.busy : "Suspend"}
        </button>
        {currentStatus !== "pending" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => runAction("reset")}
            className={`${buttonClass} border-amber-700 bg-amber-950/60 text-amber-100 hover:border-amber-500 disabled:opacity-60`}
          >
            {activeAction === "reset" ? ACTION_META.reset.busy : "Reset Pending"}
          </button>
        ) : null}
      </div>

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
