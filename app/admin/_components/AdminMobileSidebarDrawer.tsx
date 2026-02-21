"use client";

import type { ReactNode } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

type AdminMobileSidebarDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

export default function AdminMobileSidebarDrawer({
  open,
  onOpenChange,
  children,
}: AdminMobileSidebarDrawerProps) {
  const perfEnabled = process.env.NODE_ENV !== "production";
  const [instantClose, setInstantClose] = useState(false);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[6000] md:hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <button
        type="button"
        className={`absolute inset-0 bg-black/60 ${instantClose ? "transition-none duration-0" : "transition-opacity duration-200"} ${
          open ? "opacity-100" : "opacity-0"
        }`}
        aria-label="Close admin menu"
        onClick={() => onOpenChange(false)}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Admin menu"
        className={`absolute right-0 top-0 h-full w-[88vw] max-w-[320px] border-l border-neutral-800 bg-neutral-950 p-2 shadow-2xl ${instantClose ? "transition-none duration-0" : "transition-transform duration-200"} ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="mb-2 flex items-center justify-end border-b border-neutral-800 px-2 py-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100"
          >
            Close
          </button>
        </div>
        <div
          className="h-[calc(100%-3rem)] overflow-y-auto"
          onClickCapture={(event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest("a[href]")) onOpenChange(false);
            if (target?.closest('button[data-admin-logout="1"]')) {
              if (perfEnabled) {
                console.info("[ADMIN_LOGOUT_PERF] menu_close_start");
              }
              setInstantClose(true);
              onOpenChange(false);
              requestAnimationFrame(() => {
                if (perfEnabled) {
                  console.info("[ADMIN_LOGOUT_PERF] menu_close_end");
                }
                setInstantClose(false);
              });
            }
          }}
        >
          {children}
        </div>
      </aside>
    </div>,
    document.body
  );
}
