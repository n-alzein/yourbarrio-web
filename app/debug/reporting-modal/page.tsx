"use client";

import { useState } from "react";
import ReportModal from "@/components/moderation/ReportModal";

export default function ReportingModalDebugPage() {
  const [open, setOpen] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Reporting Modal Preview</h1>
        <p className="mt-2 text-sm text-gray-700">
          Debug route for accessibility and contrast checks in light theme.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="yb-primary-button rounded-lg px-4 py-2 text-sm font-semibold text-white"
          >
            Open modal
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setToast(null);
            }}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Reset
          </button>
        </div>
        {toast ? (
          <div className="mt-4 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900">
            {toast}
          </div>
        ) : null}
      </div>

      <ReportModal
        open={open}
        onClose={() => setOpen(false)}
        targetType="listing"
        targetId="00000000-0000-0000-0000-000000000001"
        targetLabel="Sample listing title"
        meta={{ source: "debug_modal" }}
        onSubmitted={(payload) => {
          setToast(payload?.message || "Submitted");
          setOpen(false);
        }}
      />
    </main>
  );
}
