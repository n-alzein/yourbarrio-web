"use client";

type StickySaveBarProps = {
  dirty: boolean;
  onSave?: () => void;
  onCancel: () => void;
  isSaving?: boolean;
  error?: string | null;
  formId?: string;
  saveLabel?: string;
};

export default function StickySaveBar({
  dirty,
  onSave,
  onCancel,
  isSaving = false,
  error,
  formId,
  saveLabel = "Save changes",
}: StickySaveBarProps) {
  if (!dirty) return null;

  return (
    <div className="sticky bottom-0 z-20 mt-3 rounded border border-neutral-700 bg-neutral-900 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-neutral-300">You have unsaved changes.</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:border-neutral-500 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type={formId ? "submit" : "button"}
            form={formId}
            onClick={formId ? undefined : onSave}
            disabled={isSaving}
            className="yb-primary-button rounded px-3 py-1.5 text-sm text-white"
          >
            {isSaving ? "Saving..." : saveLabel}
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
