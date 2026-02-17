"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import SafeImage from "@/components/SafeImage";
import useBodyScrollLock from "@/components/nav/useBodyScrollLock";

let portalVersion = 0;
const portalListeners = new Set();
let accountSidebarOpenCount = 0;

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

export default function AccountSidebar({
  open,
  onOpenChange,
  anchorRef,
  title = "Your Account",
  showTitle = true,
  profileFirst = false,
  displayName,
  email,
  avatar,
  children,
  shieldActive = false,
}) {
  const reactId = useId();
  const panelId = `account-sidebar-${reactId}`;
  const titleId = `${panelId}-title`;
  const panelRef = useRef(null);
  const closeButtonRef = useRef(null);
  const lastActiveRef = useRef(null);
  const wasOpenRef = useRef(open);
  const portalNodeRef = useRef(null);
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
    node.dataset.accountSidebar = "1";
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
    if (!open) return;
    lastActiveRef.current = anchorRef?.current || document.activeElement;
    requestAnimationFrame(() => {
      if (closeButtonRef.current) {
        closeButtonRef.current.focus();
        return;
      }
      panelRef.current?.focus();
    });
  }, [open, anchorRef]);

  useEffect(() => {
    if (!wasOpenRef.current || open) {
      wasOpenRef.current = open;
      return;
    }
    const anchorEl = anchorRef?.current || lastActiveRef.current;
    if (anchorEl && typeof anchorEl.focus === "function") {
      requestAnimationFrame(() => anchorEl.focus());
    }
    wasOpenRef.current = open;
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange?.(false);
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
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    accountSidebarOpenCount += 1;
    document.documentElement.dataset.sidebarOpen = "1";
    return () => {
      accountSidebarOpenCount = Math.max(0, accountSidebarOpenCount - 1);
      if (accountSidebarOpenCount === 0) {
        delete document.documentElement.dataset.sidebarOpen;
      }
    };
  }, [open]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const backgroundRoot =
      document.querySelector('[data-testid="customer-page-root"]') ||
      document.querySelector(".app-shell-root") ||
      document.querySelector("main");
    if (!backgroundRoot) return undefined;

    const shouldInertBackground = open || shieldActive;
    if (shouldInertBackground) {
      backgroundRoot.setAttribute("inert", "");
      backgroundRoot.setAttribute("aria-hidden", "true");
      return () => {
        backgroundRoot.removeAttribute("inert");
        backgroundRoot.removeAttribute("aria-hidden");
      };
    }

    backgroundRoot.removeAttribute("inert");
    backgroundRoot.removeAttribute("aria-hidden");
    return undefined;
  }, [open, shieldActive]);

  if (!isClient || typeof document === "undefined") return null;
  void portalStoreVersion;
  const portalHost = document.querySelector("div[data-account-sidebar=\"1\"]");
  if (!portalHost) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] ${
        open || shieldActive ? "pointer-events-auto" : "pointer-events-none"
      }`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-black/60 md:bg-black/0 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        data-testid="account-sidebar-overlay"
        onClick={() => onOpenChange?.(false)}
      />
      <div
        className={`absolute inset-y-0 right-0 w-[380px] max-w-[90vw] transform transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          id={panelId}
          tabIndex={-1}
          className="yb-sidebar-panel flex h-full flex-col border-l border-[var(--yb-border)]"
        >
          {profileFirst ? (
            <>
              <div className="yb-sidebar-header flex items-center justify-start px-6 py-3">
                <span id={titleId} className="sr-only">
                  {title}
                </span>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => onOpenChange?.(false)}
                  className="rounded-full border border-[var(--yb-border)] bg-white p-2 text-[var(--yb-text)] transition hover:bg-black/5"
                  aria-label="Close account menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-3 border-b border-[var(--yb-border)] px-6 py-5">
                <SafeImage
                  src={avatar}
                  alt="Profile avatar"
                  className="h-12 w-12 rounded-2xl object-cover border border-[var(--yb-border)]"
                  width={48}
                  height={48}
                  sizes="48px"
                  useNextImage
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{displayName}</p>
                  {email ? <p className="text-xs yb-dropdown-muted truncate">{email}</p> : null}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="yb-sidebar-header flex items-start justify-between px-6 py-5">
                <div>
                  {showTitle ? (
                    <>
                      <div id={titleId} className="text-sm font-semibold">
                        {title}
                      </div>
                      <div className="mt-1 text-xs yb-dropdown-muted">YourBarrio</div>
                    </>
                  ) : (
                    <span id={titleId} className="sr-only">
                      {title}
                    </span>
                  )}
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => onOpenChange?.(false)}
                  className="rounded-full border border-[var(--yb-border)] bg-white p-2 text-[var(--yb-text)] transition hover:bg-black/5"
                  aria-label="Close account menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-3 border-b border-[var(--yb-border)] px-6 py-4">
                <SafeImage
                  src={avatar}
                  alt="Profile avatar"
                  className="h-12 w-12 rounded-2xl object-cover border border-[var(--yb-border)]"
                  width={48}
                  height={48}
                  sizes="48px"
                  useNextImage
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{displayName}</p>
                  {email ? <p className="text-xs yb-dropdown-muted truncate">{email}</p> : null}
                </div>
              </div>
            </>
          )}

          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        </div>
      </div>
    </div>,
    portalHost
  );
}
