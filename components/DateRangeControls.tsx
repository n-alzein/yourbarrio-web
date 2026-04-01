"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, Eye, PackagePlus, Pencil } from "lucide-react";
import type { DashboardFilters, DateRangeKey } from "@/lib/dashboardTypes";

const DATE_RANGES: { value: DateRangeKey; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

type SetupItem = {
  id: string;
  label: string;
  complete: boolean;
};

type DateRangeControlsProps = {
  dateRange: DateRangeKey;
  filters: DashboardFilters;
  categories: string[];
  businessName?: string;
  businessAvatarUrl?: string | null;
  lastUpdated: string;
  setupItems: SetupItem[];
  onDateRangeChange: (value: DateRangeKey) => void;
  onFiltersChange: (filters: DashboardFilters) => void;
};

const actionBaseClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900";

const DateRangeControls = ({
  dateRange,
  filters,
  categories,
  businessName,
  businessAvatarUrl,
  lastUpdated,
  setupItems,
  onDateRangeChange,
  onFiltersChange,
}: DateRangeControlsProps) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const displayName = businessName || "YourBarrio";

  const activeFilters = useMemo(() => filters.categories.length, [filters]);
  const completedCount = useMemo(
    () => setupItems.filter((item) => item.complete).length,
    [setupItems]
  );
  const businessInitials = useMemo(() => {
    const parts = displayName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);
    const initials = parts.map((part) => part[0]?.toUpperCase() || "").join("");
    return initials || "YB";
  }, [displayName]);

  const toggleFilter = (value: string) => {
    const next = new Set(filters.categories);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    onFiltersChange({ ...filters, categories: Array.from(next) });
  };

  const resetFilters = () => {
    onFiltersChange({ categories: [] });
  };

  return (
    <section className="overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <div className="border-b border-slate-200/60 bg-[radial-gradient(circle_at_top_left,rgba(109,40,217,0.10),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,255,255,0.86))] px-5 py-6 sm:px-6 sm:py-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-[0.66rem] font-medium uppercase tracking-[0.14em] text-slate-500/75">
              Business dashboard
            </p>
            <div className="mt-3 flex items-center gap-5">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[16px] border border-slate-200/75 bg-white/94 shadow-[0_10px_22px_rgba(15,23,42,0.07)]">
                {businessAvatarUrl ? (
                  <Image
                    src={businessAvatarUrl}
                    alt={`${displayName} profile image`}
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                ) : businessInitials ? (
                  <span className="text-[0.9rem] font-semibold tracking-[0.08em] text-slate-700">
                    {businessInitials}
                  </span>
                ) : (
                  <Building2 className="h-[1.05rem] w-[1.05rem] text-slate-500" />
                )}
              </div>
              <h1 className="min-w-0 self-center pt-0.5 text-[2.15rem] font-semibold tracking-[-0.055em] text-slate-950 sm:text-[2.45rem]">
                <span className="block truncate">{displayName}</span>
              </h1>
            </div>
            <p className="mt-3 max-w-2xl text-sm text-slate-600">
              A clear view of what to do next.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              {setupItems.map((item) => (
                <div
                  key={item.id}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/92 px-3 py-1.5 text-xs text-slate-600 transition duration-200"
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      item.complete ? "bg-slate-700" : "bg-slate-300"
                    }`}
                    aria-hidden="true"
                  />
                  <span className={item.complete ? "text-slate-700" : undefined}>{item.label}</span>
                </div>
              ))}
              <span className="text-xs text-slate-500">
                {completedCount}/{setupItems.length} ready
              </span>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 xl:w-auto xl:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/business/listings/new"
                className={`${actionBaseClass} dashboard-primary-action min-h-11 px-5 text-[0.8rem] bg-[#6d28d9] text-white shadow-[0_12px_24px_-16px_rgba(109,40,217,0.55)] hover:-translate-y-0.5 hover:bg-[#5b21b6] hover:shadow-[0_18px_30px_-18px_rgba(109,40,217,0.6)]`}
              >
                <PackagePlus className="h-3.5 w-3.5" />
                Add product
              </Link>
              <Link
                href="/business/profile"
                className={`${actionBaseClass} border border-slate-200/80 bg-white/90 text-slate-700 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white`}
              >
                <Eye className="h-3.5 w-3.5" />
                View profile
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500 xl:justify-end">
              <div
                className="flex items-center rounded-full border border-[var(--border)] bg-white/88 p-1"
                role="group"
                aria-label="Date range"
              >
                {DATE_RANGES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onDateRangeChange(option.value)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                      dateRange === option.value
                        ? "bg-[#6d28d9] text-white dashboard-toggle-active"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    aria-pressed={dateRange === option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/88 px-3.5 py-2 font-semibold text-slate-700 transition hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                aria-label="Open filters"
              >
                Filters
                {activeFilters > 0 ? (
                  <span className="rounded-full bg-[#6d28d9] px-2 py-0.5 text-[10px] font-semibold text-white">
                    {activeFilters}
                  </span>
                ) : null}
              </button>
              <span>
                Updated <span className="font-medium text-slate-700">{lastUpdated}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {drawerOpen ? (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-slate-900/40 p-4 pt-24"
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
        >
          <div className="flex h-auto w-full max-h-[65vh] max-w-sm flex-col rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300"
              >
                Close
              </button>
            </div>
            <div className="mt-4 flex-1 space-y-6 overflow-auto pr-1">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Categories
                </p>
                <div className="mt-3 grid gap-2">
                  {categories.length === 0 ? (
                    <p className="text-xs text-slate-500">No categories yet.</p>
                  ) : null}
                  {categories.map((option) => (
                    <label
                      key={option}
                      className="flex items-center justify-between rounded-xl border border-slate-200/80 px-3 py-2 text-sm text-slate-700"
                    >
                      <span>{option}</span>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                        checked={filters.categories.includes(option)}
                        onChange={() => toggleFilter(option)}
                        aria-label={`Filter ${option}`}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Reset filters
              </button>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="dashboard-apply-filters rounded-full border border-slate-200/80 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              >
                Apply filters
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default DateRangeControls;
