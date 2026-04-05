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
        "flex h-full w-full flex-col items-center justify-center rounded-[18px] border border-slate-200/70 bg-slate-50/70 text-center transition duration-200",
        compact ? "px-5 py-6" : "px-8 py-9",
        className,
      ].join(" ")}
    >
      <h3
        className={
          compact ? "text-lg font-semibold text-slate-900" : "text-xl font-semibold text-slate-900"
        }
      >
        {title}
      </h3>
      {description ? (
        <p
          className={
            compact ? "mt-2 max-w-sm text-sm leading-6 text-slate-500" : "mt-2 max-w-md text-sm text-slate-600"
          }
        >
          {description}
        </p>
      ) : null}
      {primaryAction || secondaryAction ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          {primaryAction ? (
            <Link
              href={primaryAction.href}
              className="dashboard-primary-action inline-flex items-center justify-center rounded-xl bg-[#6d28d9] px-4 py-2 text-sm font-semibold text-white transition duration-200 hover:bg-[#5b21b6]"
            >
              {primaryAction.label}
            </Link>
          ) : null}
          {secondaryAction ? (
            <Link
              href={secondaryAction.href}
              className="dashboard-toolbar-button inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-slate-700 transition duration-200 hover:border-slate-300 hover:bg-white"
            >
              {secondaryAction.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default DashboardEmptyState;
