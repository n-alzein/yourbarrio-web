"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  looksLikeHtml,
  plainTextToHtml,
  stripHtmlToText,
} from "@/lib/listingDescription";

const AI_LIMIT_MESSAGE =
  "AI suggestions will be available again tomorrow. You can still edit this manually.";

function normalizeDescriptionValue(value) {
  const raw = String(value || "");
  if (!raw.trim()) return "";
  return looksLikeHtml(raw) ? stripHtmlToText(raw) : raw.trim();
}

function buildAppliedDescription(context, value) {
  if (context === "listing-editor") {
    return plainTextToHtml(value);
  }
  return value;
}

function buildRequestBody({
  type,
  name,
  category,
  context,
  targetId,
  action,
  existingDescription,
  currentSuggestion,
}) {
  const normalizedAction =
    action === "shorter"
      ? "shorter"
      : action === "premium"
        ? "more_premium"
        : action === "casual"
          ? "more_casual"
          : action === "details"
            ? "add_details"
        : action;
  return {
    type,
    name: String(name || "").trim() || undefined,
    category: String(category || "").trim() || undefined,
    surface: context,
    targetId: String(targetId || "").trim() || undefined,
    action: normalizedAction,
    existingDescription: existingDescription || undefined,
    currentSuggestion: currentSuggestion || undefined,
  };
}

function buildSuggestionHint(action) {
  switch (action) {
    case "shorter":
      return "Made more concise";
    case "premium":
      return "Elevated tone";
    case "casual":
      return "More relaxed tone";
    case "details":
      return "Added more detail";
    case "regenerate":
      return "Refined for clarity and tone";
    case "generate":
    default:
      return "Refined for clarity and tone";
  }
}

export default function AIDescriptionAssistant({
  type,
  name,
  category,
  value,
  onApply,
  targetId,
  context = "onboarding",
  compact = false,
  label,
  className = "",
}) {
  const [suggestion, setSuggestion] = useState("");
  const [error, setError] = useState("");
  const [loadingAction, setLoadingAction] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [refineMenuOpen, setRefineMenuOpen] = useState(false);
  const [lastAction, setLastAction] = useState("generate");
  const menuRef = useRef(null);

  const existingDescription = useMemo(
    () => normalizeDescriptionValue(value),
    [value]
  );
  const hasExistingDescription = existingDescription.length > 0;
  const buttonLabel = label || (hasExistingDescription ? "Improve with AI" : "Help me write this");
  const appliedDescription = suggestion.trim();
  const isLimitMessage = error === AI_LIMIT_MESSAGE;

  useEffect(() => {
    if (!refineMenuOpen) return undefined;

    function handlePointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setRefineMenuOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setRefineMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [refineMenuOpen]);

  async function requestSuggestion(action) {
    setError("");
    setLoadingAction(action);
    setRefineMenuOpen(false);

    try {
      const response = await fetch("/api/ai/description", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          buildRequestBody({
            type,
            name,
            category,
            context,
            targetId,
            action,
            existingDescription,
            currentSuggestion: suggestion.trim(),
          })
        ),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.error || !payload?.description) {
        if (response.status === 429) {
          throw new Error(AI_LIMIT_MESSAGE);
        }
        throw new Error(
          payload?.error || "AI suggestion unavailable right now. Please try again later."
        );
      }

      setSuggestion(String(payload.description || "").trim());
      setLastAction(action);
      setReviewOpen(true);
    } catch (requestError) {
      setError(requestError?.message || "AI suggestion unavailable right now.");
    } finally {
      setLoadingAction("");
    }
  }

  function handleApply() {
    if (!appliedDescription) return;
    onApply?.(buildAppliedDescription(context, appliedDescription));
    setReviewOpen(false);
    setRefineMenuOpen(false);
  }

  function handleCancel() {
    setReviewOpen(false);
    setSuggestion("");
    setError("");
    setLoadingAction("");
    setRefineMenuOpen(false);
  }

  return (
    <div
      className={`${compact ? "space-y-0" : "mt-4 space-y-0"} ${className}`.trim()}
      data-testid={`ai-description-assistant-${context}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => requestSuggestion("generate")}
          disabled={Boolean(loadingAction)}
          className={
            compact
              ? "inline-flex h-9 items-center justify-center rounded-[10px] border border-purple-100/60 bg-white px-3 text-xs font-semibold text-[#7152c9] transition hover:border-purple-100 hover:bg-purple-50/35 disabled:cursor-not-allowed disabled:opacity-60"
              : "inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          }
        >
          {loadingAction === "generate" ? "Writing..." : buttonLabel}
        </button>
      </div>

      {error ? (
        <div className="mt-3">
          <p className={isLimitMessage ? "text-sm text-slate-400" : "text-sm text-rose-600"}>
            {error}
          </p>
        </div>
      ) : null}

      {reviewOpen && appliedDescription ? (
        <div className="mt-5 border-t border-slate-200/60 pt-4">
          <div className="rounded-lg bg-slate-50/45 px-3 py-2.5">
            <div className="mb-1.5 space-y-0.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">Polished description</p>
              </div>
              <p className="text-xs text-slate-500">{buildSuggestionHint(lastAction)}</p>
            </div>

            <div className="whitespace-pre-wrap rounded-lg bg-white/80 px-3 py-2 text-sm leading-6 text-slate-800 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.10)]">
              {appliedDescription}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleApply}
                className="rounded-full bg-violet-100 px-3 py-1.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-200"
              >
                Use this
              </button>
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setRefineMenuOpen((open) => !open)}
                  disabled={Boolean(loadingAction)}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingAction === "shorter" ||
                  loadingAction === "premium" ||
                  loadingAction === "casual" ||
                  loadingAction === "details"
                    ? "Updating..."
                    : "Adjust"}
                  <span className="ml-2 text-xs text-slate-400">▾</span>
                </button>
                {refineMenuOpen ? (
                  <div className="absolute left-0 top-full z-20 mt-2 min-w-[11rem] overflow-hidden rounded-2xl bg-white p-1.5 shadow-lg shadow-slate-200/70 ring-1 ring-slate-200">
                    {[
                      { label: "Shorter", action: "shorter" },
                      { label: "More premium", action: "premium" },
                      { label: "More casual", action: "casual" },
                      { label: "Add details", action: "details" },
                    ].map((item) => (
                      <button
                        key={item.action}
                        type="button"
                        onClick={() => requestSuggestion(item.action)}
                        className="block w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => requestSuggestion("regenerate")}
                disabled={Boolean(loadingAction)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingAction === "regenerate" ? "Updating..." : "Regenerate"}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={Boolean(loadingAction)}
                className="px-2 py-1 text-sm font-medium text-slate-400 transition hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
