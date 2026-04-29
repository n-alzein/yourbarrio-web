"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export default function SearchCategoryDropdown({
  id,
  value,
  options,
  onChange,
  ariaLabel = "Category",
  widthCh = 9,
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const selectedIndex = useMemo(
    () => Math.max(0, options.findIndex((option) => option === value)),
    [options, value]
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const buttonRef = useRef(null);
  const optionRefs = useRef([]);
  const listboxId = id ? `${id}-listbox` : "search-category-listbox";

  useEffect(() => {
    setActiveIndex(selectedIndex);
  }, [selectedIndex]);

  useEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const trigger = buttonRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 12;
      const preferredWidth = Math.max(rect.width, 224);
      const maxWidth = Math.max(180, window.innerWidth - viewportPadding * 2);
      const width = Math.min(preferredWidth, maxWidth);
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        window.innerWidth - width - viewportPadding
      );

      setMenuStyle({
        position: "fixed",
        top: rect.bottom + 8,
        left,
        width,
      });
    };

    const handlePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!buttonRef.current?.contains(target) && !optionRefs.current.some((node) => node?.contains?.(target))) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  function commitSelection(nextValue) {
    onChange(nextValue);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function handleTriggerKeyDown(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(selectedIndex);
    }
  }

  function handleOptionKeyDown(event, index) {
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
      commitSelection(options[index]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
  }

  const menu =
    open && menuStyle
      ? createPortal(
          <div
            className="z-[140] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md"
            style={menuStyle}
          >
            <div
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel}
              className="max-h-64 overflow-y-auto p-1"
            >
              {options.map((option, index) => {
                const selected = option === value;
                return (
                  <button
                    key={option}
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    tabIndex={activeIndex === index ? 0 : -1}
                    onClick={() => commitSelection(option)}
                    onMouseEnter={() => setActiveIndex(index)}
                    onKeyDown={(event) => handleOptionKeyDown(event, index)}
                    className={[
                      "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition focus-visible:outline-none",
                      selected
                        ? "bg-purple-50 text-slate-900"
                        : "text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50",
                    ].join(" ")}
                  >
                    <span className="min-w-0 truncate">{option}</span>
                    {selected ? <Check className="h-4 w-4 shrink-0 text-purple-600" /> : null}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        id={id}
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        className="relative appearance-none bg-transparent pr-7 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80 focus:outline-none"
        style={{ width: `${widthCh}ch` }}
      >
        <span className="block truncate text-left">{value}</span>
        <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 text-white/60 transition-transform duration-200 ease-out" />
      </button>
      {menu}
    </>
  );
}
