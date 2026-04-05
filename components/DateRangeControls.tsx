"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, CheckCircle2, Eye, PackagePlus, SlidersHorizontal } from "lucide-react";
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
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] px-4 py-2 text-sm font-semibold transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900";

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
  const setupComplete = setupItems.length > 0 && completedCount === setupItems.length;
  const progressPercent =
    setupItems.length > 0 ? Math.round((completedCount / setupItems.length) * 100) : 0;
  const nextStepLabel = useMemo(
    () => setupItems.find((item) => !item.complete)?.label ?? "All setup steps finished",
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
    <section className="dashboard-panel overflow-hidden">
      <div className="border-b border-slate-200/40 bg-white px-6 py-8 sm:px-7 sm:py-9">
        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="min-w-0">
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-slate-400/90">
              Business dashboard
            </p>
            <div className="mt-6 flex items-start gap-4 sm:gap-5">
              <div className="relative mt-0.5 flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-slate-200/70 bg-white shadow-[0_5px_14px_rgba(15,23,42,0.04)]">
                {businessAvatarUrl ? (
                  <Image
                    src={businessAvatarUrl}
                    alt={`${displayName} profile image`}
                    fill
                    sizes="56px"
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
              <div className="min-w-0">
                <h1 className="min-w-0 text-[2rem] font-semibold tracking-[-0.055em] text-slate-950 sm:text-[2.35rem]">
                  <span className="block truncate">{displayName}</span>
                </h1>
                <p className="mt-3.5 max-w-2xl text-sm leading-6 text-slate-600">
                  A clear view of what to do next across products, traffic, and orders.
                </p>
                {setupComplete ? (
                  <div className="mt-3 inline-flex items-center gap-2 text-[0.78rem] text-slate-400">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    <span>All setup steps completed</span>
                  </div>
                ) : null}
              </div>
            </div>

            {!setupComplete ? (
              <div className="mt-7 max-w-2xl transition-all duration-200 ease-out">
                <div className="border-l border-slate-200/70 pl-4 sm:pl-5">
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Setup in progress</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {completedCount} of {setupItems.length} steps finished
                      </p>
                    </div>
                    <p className="text-[0.64rem] font-medium uppercase tracking-[0.12em] text-slate-400/85">
                      Next: {nextStepLabel}
                    </p>
                  </div>
                  <div className="mt-3.5 h-[5px] overflow-hidden rounded-full bg-slate-200/60">
                    <div
                      className="h-full rounded-full bg-[#6a48c7] transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2.5 text-[0.69rem] text-slate-500">
                    {setupItems.map((item) => (
                      <span key={item.id} className="inline-flex items-center gap-2">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            item.complete ? "bg-emerald-300" : "bg-slate-300"
                          }`}
                          aria-hidden="true"
                        />
                        <span className={item.complete ? "text-slate-600" : "text-slate-400"}>
                          {item.label}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex w-full flex-col gap-4 xl:w-auto xl:min-w-[300px] xl:items-end xl:pt-0.5">
            <div className="flex flex-wrap items-center gap-2.5 xl:justify-end">
              <Link
                href="/business/listings/new"
                className={`${actionBaseClass} dashboard-primary-action min-h-[46px] bg-[#6a48c7] px-5.5 text-white shadow-[0_8px_18px_-12px_rgba(106,72,199,0.42)] hover:-translate-y-[1px] hover:bg-[#7353cf]`}
              >
                <PackagePlus className="h-3.5 w-3.5" />
                Add product
              </Link>
              <Link
                href="/business/profile"
                className={`${actionBaseClass} dashboard-toolbar-button text-slate-700 hover:-translate-y-[1px] hover:border-slate-300 hover:bg-white`}
              >
                <Eye className="h-3.5 w-3.5" />
                View profile
              </Link>
            </div>

            <div className="flex flex-col gap-2.5 text-xs text-slate-500 xl:items-end">
              <span className="text-[0.68rem] text-slate-400/85">
                Updated <span className="font-medium text-slate-400">{lastUpdated}</span>
              </span>
              <div className="flex flex-wrap items-center gap-2.5 xl:justify-end">
                <div
                  className="dashboard-toolbar-button flex items-center p-1"
                  role="group"
                  aria-label="Date range"
                >
                  {DATE_RANGES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onDateRangeChange(option.value)}
                      className={`dashboard-segment px-3 py-1.5 text-[0.72rem] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                        dateRange === option.value
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
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
                  className="dashboard-toolbar-button flex items-center gap-2 px-3.5 py-2 text-[0.72rem] font-semibold text-slate-500 transition hover:border-slate-200 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                  aria-label="Open filters"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Filters
                  {activeFilters > 0 ? (
                    <span className="rounded-md bg-[#6d28d9] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {activeFilters}
                    </span>
                  ) : null}
                </button>
              </div>
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
          <div className="flex h-auto w-full max-h-[65vh] max-w-sm flex-col rounded-[20px] bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="dashboard-toolbar-button px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300"
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
                      className="flex items-center justify-between rounded-2xl border border-slate-200/80 px-3 py-2 text-sm text-slate-700"
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
                className="dashboard-apply-filters dashboard-toolbar-button px-4 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
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
