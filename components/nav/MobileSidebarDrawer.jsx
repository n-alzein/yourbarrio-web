"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import useBodyScrollLock from "./useBodyScrollLock";

let portalVersion = 0;
const portalListeners = new Set();
let mobileSidebarOpenCount = 0;

function bumpPortalVersion() {
  portalVersion += 1;
  portalListeners.forEach((listener) => listener());
}

function subscribePortal(listener) {
  portalListeners.add(listener);
  return () => portalListeners.delete(listener);
}

function getPortalSnapshot() {
  return portalVersion;
}

function getPortalServerSnapshot() {
  return 0;
}

function subscribeNoop() {
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

const FOCUSABLE_SELECTORS = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=\"hidden\"])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable=\"true\"]",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",");

export default function MobileSidebarDrawer({
  open,
  onClose,
  title = "Menu",
  children,
  footer = null,
  id,
  showHeader = true,
}) {
  const reactId = useId();
  const panelId = id || `mobile-drawer-${reactId}`;
  const titleId = `${panelId}-title`;
  const panelRef = useRef(null);
  const closeButtonRef = useRef(null);
  const lastActiveRef = useRef(null);
  const portalNodeRef = useRef(null);
  const wasOpenRef = useRef(open);
  const isClient = useSyncExternalStore(
    subscribeNoop,
    getClientSnapshot,
    getServerSnapshot
  );
  const portalStoreVersion = useSyncExternalStore(
    subscribePortal,
    getPortalSnapshot,
    getPortalServerSnapshot
  );

  useBodyScrollLock(open);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (portalNodeRef.current) return undefined;
    const node = document.createElement("div");
    node.dataset.mobileSidebarDrawer = "1";
    document.body.appendChild(node);
    portalNodeRef.current = node;
    bumpPortalVersion();
    return () => {
      try {
        if (node.isConnected) document.body.removeChild(node);
      } catch {
        /* ignore */
      }
      if (portalNodeRef.current === node) {
        portalNodeRef.current = null;
      }
      bumpPortalVersion();
    };
  }, []);

  useEffect(() => {
    if (open) {
      lastActiveRef.current = document.activeElement;
      requestAnimationFrame(() => {
        if (closeButtonRef.current) {
          closeButtonRef.current.focus();
          return;
        }
        panelRef.current?.focus();
      });
    }
  }, [open]);

  useEffect(() => {
    if (!wasOpenRef.current || open) {
      wasOpenRef.current = open;
      return;
    }
    const lastActive = lastActiveRef.current;
    if (lastActive && typeof lastActive.focus === "function") {
      requestAnimationFrame(() => lastActive.focus());
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTORS)).filter(
        (el) => !el.hasAttribute("disabled")
      );
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !panel.contains(active)) {
          last.focus();
          event.preventDefault();
        }
      } else if (active === last) {
        first.focus();
        event.preventDefault();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    mobileSidebarOpenCount += 1;
    document.documentElement.dataset.sidebarOpen = "1";
    return () => {
      mobileSidebarOpenCount = Math.max(0, mobileSidebarOpenCount - 1);
      if (mobileSidebarOpenCount === 0) {
        delete document.documentElement.dataset.sidebarOpen;
      }
    };
  }, [open]);

  if (!isClient || typeof document === "undefined") return null;
  void portalStoreVersion;
  const portalHost = document.querySelector(
    "div[data-mobile-sidebar-drawer=\"1\"]"
  );
  if (!portalHost) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 z-0 pointer-events-auto bg-black/60 md:bg-black/0 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        data-testid="mobile-sidebar-overlay"
        onClick={onClose}
      />
      <div
        className={`absolute inset-y-0 left-0 z-10 w-[88vw] max-w-[360px] transform transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={showHeader ? titleId : undefined}
          aria-label={!showHeader ? title : undefined}
          id={panelId}
          tabIndex={-1}
          className="yb-sidebar-panel yb-dropdown-surface flex h-full flex-col border-r border-[var(--yb-border)]"
        >
          {showHeader ? (
            <div className="yb-sidebar-header flex items-center justify-between px-5 py-4">
              <div>
                <div id={titleId} className="text-sm font-semibold">
                  {title}
                </div>
                <div className="text-[11px] yb-dropdown-muted">YourBarrio</div>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                className="rounded-full border border-[var(--yb-border)] bg-white p-2 text-[var(--yb-text)] transition hover:bg-black/5"
                aria-label="Close menu"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor">
                  <path strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 z-10 rounded-full border border-[var(--yb-border)] bg-white p-2 text-[var(--yb-text)] transition hover:bg-black/5"
              aria-label="Close menu"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor">
                <path strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <div className={`flex-1 overflow-y-auto px-5 ${showHeader ? "py-5" : "pb-5 pt-4"}`}>
            {children}
          </div>
          {footer ? <div className="border-t border-white/10 px-5 py-4">{footer}</div> : null}
        </div>
      </div>
    </div>,
    portalHost
  );
}
