"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";

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
  loading?: boolean;
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
  const [open, setOpen] = useState(false);
  const selectedIndex = useMemo(
    () => Math.max(0, options.findIndex((option) => option.value === value)),
    [options, value]
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = useId();
  const selectedOption = options[selectedIndex] || options[0];

  useEffect(() => {
    setActiveIndex(selectedIndex);
  }, [selectedIndex]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!rootRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  function commitSelection(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(selectedIndex);
    }
  }

  function handleOptionKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index + 1) % options.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index - 1 + options.length) % options.length);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(options.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commitSelection(options[index].value);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
  }

  return (
    <div ref={rootRef} className="relative flex min-w-0 flex-1">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        className="relative flex h-10 w-full min-w-0 items-center gap-2 px-3 text-left text-sm text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8c73bb59] focus-visible:ring-inset md:h-11 md:px-4"
      >
        <span className="shrink-0 whitespace-nowrap text-[11px] font-medium text-slate-400 md:text-xs">
          {label}
        </span>
        <span className="min-w-0 flex-1 truncate pr-7 text-[13px] font-medium text-slate-800 md:text-sm">
          {selectedOption?.label || ""}
        </span>
        <ChevronDown
          className={[
            "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform md:right-4",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      {open ? (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-2 min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md md:right-auto md:min-w-full"
        >
          <div
            id={listboxId}
            role="listbox"
            aria-label={label}
            className="max-h-64 overflow-y-auto p-1"
          >
            {options.map((option, index) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={activeIndex === index ? 0 : -1}
                  onClick={() => commitSelection(option.value)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onKeyDown={(event) => handleOptionKeyDown(event, index)}
                  className={[
                    "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition focus-visible:outline-none",
                    selected
                      ? "bg-purple-50 text-slate-900"
                      : "text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50",
                  ].join(" ")}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  {selected ? <Check className="h-4 w-4 shrink-0 text-purple-600" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
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
  loading = false,
}: ListingsToolbarProps) {
  return (
    <div className="w-full min-w-0 pb-1">
      <div className="grid w-full min-w-0 grid-cols-2 gap-2 md:flex md:gap-0 md:overflow-visible md:rounded-2xl md:border md:border-slate-200 md:bg-white md:shadow-[0_10px_30px_-28px_rgba(15,23,42,0.16)]">
        <div className="col-span-2 min-w-0 rounded-xl border border-slate-200 bg-white shadow-[0_10px_30px_-28px_rgba(15,23,42,0.16)] md:col-span-1 md:flex md:flex-1 md:rounded-none md:border-0 md:border-r md:border-slate-200 md:bg-transparent md:shadow-none">
          <SelectControl
            label="Category"
            value={category}
            options={categoryOptions}
            onChange={onCategoryChange}
          />
        </div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-[0_10px_30px_-28px_rgba(15,23,42,0.16)] md:flex md:flex-1 md:rounded-none md:border-0 md:border-r md:border-slate-200 md:bg-transparent md:shadow-none">
          <SelectControl
            label="Sort"
            value={sortBy}
            options={sortOptions}
            onChange={onSortChange}
          />
        </div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-[0_10px_30px_-28px_rgba(15,23,42,0.16)] md:flex md:flex-1 md:rounded-none md:border-0 md:bg-transparent md:shadow-none">
          <button
            type="button"
            onClick={onOpenFilters}
            className="inline-flex h-10 w-full min-w-0 items-center justify-center gap-2 px-3 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8c73bb59] focus-visible:ring-inset md:h-11 md:justify-start md:px-4 md:text-sm"
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-slate-500" />
            <span className="min-w-0 truncate whitespace-nowrap">
              {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : "Filters"}
            </span>
            {loading ? (
              <span
                className="ml-auto inline-flex h-2 w-2 shrink-0 rounded-full bg-slate-300"
                aria-hidden="true"
                data-testid="listings-toolbar-loading-indicator"
              />
            ) : null}
          </button>
        </div>
      </div>
    </div>
  );
}
