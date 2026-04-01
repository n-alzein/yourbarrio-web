"use client";

import Link from "next/link";

type DashboardEmptyAction = {
  href: string;
  label: string;
};

type DashboardEmptyStateProps = {
  title: string;
  description?: string;
  primaryAction?: DashboardEmptyAction;
  secondaryAction?: DashboardEmptyAction;
  compact?: boolean;
  className?: string;
};

const DashboardEmptyState = ({
  title,
  description,
  primaryAction,
  secondaryAction,
  compact = false,
  className = "",
}: DashboardEmptyStateProps) => {
  return (
    <div
      className={[
        "flex h-full w-full flex-col items-center justify-center rounded-[24px] border border-slate-200/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(255,255,255,0.74))] text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] transition duration-200",
        compact ? "px-5 py-5" : "px-8 py-9",
        className,
      ].join(" ")}
    >
      <h3
        className={
          compact ? "text-base font-semibold text-slate-900" : "text-xl font-semibold text-slate-900"
        }
      >
        {title}
      </h3>
      {description ? (
        <p
          className={
            compact ? "mt-1.5 text-sm text-slate-500" : "mt-2 max-w-md text-sm text-slate-600"
          }
        >
          {description}
        </p>
      ) : null}
      {primaryAction || secondaryAction ? (
        <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2.5">
          {primaryAction ? (
            <Link
              href={primaryAction.href}
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#6d28d9] transition duration-200 hover:text-[#5b21b6]"
            >
              <span aria-hidden="true">→</span>
              {primaryAction.label}
            </Link>
          ) : null}
          {secondaryAction ? (
            <Link
              href={secondaryAction.href}
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#6d28d9] transition duration-200 hover:text-[#5b21b6]"
            >
              <span aria-hidden="true">→</span>
              {secondaryAction.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default DashboardEmptyState;
