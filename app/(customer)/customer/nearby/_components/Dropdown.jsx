"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import styles from "../nearby.module.css";

export default function Dropdown({
  value,
  options,
  onChange,
  ariaLabel,
  testId,
}) {
  const generatedId = useId();
  const listboxId = `${generatedId}-listbox`;
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);
  const normalizedOptions = useMemo(
    () =>
      (Array.isArray(options) ? options : []).map((option) =>
        typeof option === "string" ? { value: option, label: option } : option
      ),
    [options]
  );
  const selectedIndex = Math.max(
    0,
    normalizedOptions.findIndex((option) => option.value === value)
  );
  const selectedOption = normalizedOptions[selectedIndex] || normalizedOptions[0];
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  useEffect(() => {
    setActiveIndex(selectedIndex);
  }, [selectedIndex]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!rootRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
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

  const commitSelection = (nextValue) => {
    onChange(nextValue);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const openFromTrigger = (nextIndex = selectedIndex) => {
    setActiveIndex(nextIndex);
    setOpen(true);
  };

  const handleTriggerKeyDown = (event) => {
    if (!normalizedOptions.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      openFromTrigger(selectedIndex);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      openFromTrigger(selectedIndex);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open ? setOpen(false) : openFromTrigger(selectedIndex);
    }
  };

  const handleOptionKeyDown = (event, index) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index + 1) % normalizedOptions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index - 1 + normalizedOptions.length) % normalizedOptions.length);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(normalizedOptions.length - 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commitSelection(normalizedOptions[index].value);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => {
          setActiveIndex(selectedIndex);
          setOpen((current) => !current);
        }}
        onKeyDown={handleTriggerKeyDown}
        data-testid={testId}
        className={`flex h-11 w-full items-center justify-between gap-3 rounded-lg border bg-white px-4 text-left text-sm text-gray-800 transition focus:outline-none ${
          open
            ? "border-[#6d3df5] ring-2 ring-[#6d3df5]/20"
            : "border-gray-200 hover:border-gray-300"
        }`}
      >
        <span className="min-w-0 truncate">{selectedOption?.label || ""}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          className={`${styles.dropdownMenu} absolute left-0 top-full z-50 mt-2 min-w-full overflow-hidden rounded-xl border border-gray-200 bg-white py-2 shadow-lg`}
        >
          <div
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            className="max-h-72 overflow-y-auto"
          >
            {normalizedOptions.map((option, index) => {
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
                  className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition focus:outline-none ${
                    selected
                      ? "bg-[#6d3df5]/5 text-[#6d3df5]"
                      : "text-gray-700 hover:bg-gray-50 focus:bg-gray-50"
                  }`}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  {selected ? <Check className="h-4 w-4 shrink-0 text-[#6d3df5]" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
