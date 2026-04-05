"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useModal } from "@/components/modals/ModalProvider";
import { getAuthedContext } from "@/lib/auth/getAuthedContext";
import {
  MODERATION_REASONS,
  MODERATION_REASON_LABELS,
} from "@/lib/moderation/reasons";

const MAX_DETAILS = 1000;

export default function ReportModal({
  open,
  onClose,
  targetType,
  targetId,
  targetLabel,
  meta,
  onSubmitted,
}) {
  const { user } = useAuth();
  const { openModal } = useModal();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const reasons = useMemo(() => {
    const key = String(targetType || "").toLowerCase();
    return MODERATION_REASONS[key] || [];
  }, [targetType]);

  if (!open) return null;

  const title =
    String(targetType || "").toLowerCase() === "review"
      ? "Report this review"
      : String(targetType || "").toLowerCase() === "listing"
        ? "Report this listing"
        : "Report this account";

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    if (!user?.id) {
      onClose?.();
      openModal("customer-login");
      return;
    }

    if (!targetType || !targetId || !reason) {
      setError("Select a reason before submitting.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const { client } = await getAuthedContext("createModerationFlag");
      const payloadMeta = {
        ...(meta || {}),
        page_url:
          typeof window !== "undefined"
            ? `${window.location.pathname}${window.location.search}`
            : "",
      };

      const { error: rpcError } = await client.rpc("create_moderation_flag", {
        p_target_type: targetType,
        p_target_id: targetId,
        p_reason: reason,
        p_details: details.trim() || null,
        p_meta: payloadMeta,
      });

      if (rpcError) {
        const message = String(rpcError.message || "");
        if (/Not authenticated/i.test(message)) {
          onClose?.();
          openModal("customer-login");
          return;
        }
        throw rpcError;
      }

      setReason("");
      setDetails("");
      onSubmitted?.({
        type: "success",
        message: "Thanks - your report has been received.",
      });
      onClose?.();
    } catch (err) {
      const message = String(err?.message || "Could not submit your report.");
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-white/80 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl border border-gray-300 bg-white p-6 text-gray-900 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            {targetLabel ? (
              <p className="mt-1 text-sm text-gray-700">{targetLabel}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Close report modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">
              Reason
            </label>
            <select
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
            >
              <option value="">Select a reason</option>
              {reasons.map((code) => (
                <option key={code} value={code}>
                  {MODERATION_REASON_LABELS[code] || code}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">
              Additional details (optional)
            </label>
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value.slice(0, MAX_DETAILS))}
              rows={4}
              maxLength={MAX_DETAILS}
              placeholder="Provide context to help our moderation team."
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
            />
            <p className="mt-1 text-xs text-gray-600">{details.length}/{MAX_DETAILS}</p>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !reason}
              className="yb-primary-button rounded-lg px-4 py-2 text-sm font-semibold text-white"
            >
              {submitting ? "Submitting..." : "Submit report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
