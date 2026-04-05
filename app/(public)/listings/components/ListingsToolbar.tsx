"use client";

import { SlidersHorizontal } from "lucide-react";

type SelectOption = {
  value: string;
  label: string;
};

type ListingsToolbarProps = {
  category: string;
  onCategoryChange: (value: string) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  onOpenFilters: () => void;
  categoryOptions: SelectOption[];
  sortOptions: SelectOption[];
  activeFilterCount?: number;
};

function SelectControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-black/5 bg-white/88 pl-3 pr-2 text-sm text-slate-600 shadow-[0_10px_30px_-28px_rgba(15,23,42,0.28)] transition focus-within:border-[#7c5cff26] focus-within:bg-[#faf7ff]">
      <span className="whitespace-nowrap text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-full bg-transparent pr-5 text-sm font-medium text-slate-700 outline-none"
        aria-label={label}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function ListingsToolbar({
  category,
  onCategoryChange,
  sortBy,
  onSortChange,
  onOpenFilters,
  categoryOptions,
  sortOptions,
  activeFilterCount = 0,
}: ListingsToolbarProps) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex min-w-max items-center gap-2 pb-1">
        <SelectControl
          label="Category"
          value={category}
          options={categoryOptions}
          onChange={onCategoryChange}
        />
        <SelectControl
          label="Sort"
          value={sortBy}
          options={sortOptions}
          onChange={onSortChange}
        />
        <button
          type="button"
          onClick={onOpenFilters}
          className={[
            "inline-flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-medium transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cff]/35 focus-visible:ring-offset-2",
            activeFilterCount > 0
              ? "border border-[#7c5cff1f] bg-[#f5f0ff] text-[#4b2aad] shadow-[0_10px_30px_-24px_rgba(76,29,149,0.45)]"
              : "border border-black/5 bg-white/88 text-slate-600 shadow-[0_10px_30px_-28px_rgba(15,23,42,0.28)] hover:border-[#7c5cff24] hover:bg-[#faf7ff] hover:text-slate-900",
          ].join(" ")}
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : "Filters"}
        </button>
      </div>
    </div>
  );
}
