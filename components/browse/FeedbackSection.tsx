"use client";

import { useMemo, useSyncExternalStore } from "react";

type FeedbackSectionProps = {
  mode?: "public" | "customer";
  className?: string;
};

const SUPPORT_EMAIL = "support@yourbarrio.com";
const noopSubscribe = () => () => {};
const getServerPathSnapshot = () => "/";
const getClientPathSnapshot = () => {
  if (typeof window === "undefined") return "/";
  const pathname = window.location?.pathname || "/";
  const search = window.location?.search || "";
  return `${pathname}${search}`;
};

export default function FeedbackSection({ mode = "public", className = "" }: FeedbackSectionProps) {
  const currentPath = useSyncExternalStore(
    noopSubscribe,
    getClientPathSnapshot,
    getServerPathSnapshot
  );
  void mode;

  const mailtoHref = useMemo(() => {
    const subject = "YourBarrio Feedback";
    const body = [
      `Page: ${currentPath || "/"}`,
      "",
      "What I was trying to do:",
      "",
      "What happened:",
      "",
      "Suggestion:",
    ].join("\n");

    return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [currentPath]);

  return (
    <section className={`w-full bg-[#f7f3ed] ${className}`}>
      <div className="mx-auto w-full max-w-5xl px-5 sm:px-6 md:px-8 py-10 sm:py-12 text-center">
        <h2 className="text-base sm:text-lg font-medium text-slate-800">
          Help us improve YourBarrio
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Have feedback or found a bug? We’d love to hear from you.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <a
            href={mailtoHref}
            className="text-sm font-medium text-slate-700 transition-colors hover:text-slate-900 hover:underline underline-offset-4"
          >
            Send feedback
          </a>
          <span className="text-slate-400" aria-hidden="true">
            ·
          </span>
          <a
            href={mailtoHref}
            className="text-sm text-slate-600 transition-colors hover:text-slate-900 hover:underline underline-offset-4"
          >
            {SUPPORT_EMAIL}
          </a>
        </div>
      </div>
    </section>
  );
}
