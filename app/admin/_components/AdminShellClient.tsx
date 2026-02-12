"use client";

import type { ReactNode } from "react";
import { useLocalStorageState } from "@/lib/hooks/useLocalStorageState";
import AdminNavbar from "@/components/nav/AdminNavbar";

type AdminShellClientProps = {
  children: ReactNode;
  currentRoleKey: string;
  sidebarExpandedContent: ReactNode;
  sidebarCollapsedContent: ReactNode;
  statusContent?: ReactNode;
};

export default function AdminShellClient({
  children,
  currentRoleKey,
  sidebarExpandedContent,
  sidebarCollapsedContent,
  statusContent = null,
}: AdminShellClientProps) {
  const [pinnedExpanded, setPinnedExpanded] = useLocalStorageState(
    "yb.admin.sidebar.pinnedExpanded",
    true
  );
  const [collapsed, setCollapsed] = useLocalStorageState("yb.admin.sidebar.collapsed", false);

  const sidebarCollapsed = collapsed;
  const toggleCollapsed = () => setCollapsed((prev) => !prev);
  const togglePinned = () => {
    const nextPinned = !pinnedExpanded;
    setPinnedExpanded(nextPinned);
    if (nextPinned) setCollapsed(false);
  };

  return (
    <div
      className="yb-admin-root yb-admin-shell h-screen overflow-hidden bg-neutral-950 text-neutral-100"
      style={{ ["--admin-nav-h" as string]: "80px" }}
    >
      <AdminNavbar role={currentRoleKey} />

      <div className="flex min-h-0">
        <aside
          className={`fixed left-0 z-[4000] overflow-y-auto border-r border-neutral-800 bg-neutral-950/95 transition-[width] duration-200 top-[calc(var(--admin-nav-h)+var(--yb-support-mode-offset,0px))] h-[calc(100vh-var(--admin-nav-h)-var(--yb-support-mode-offset,0px))] ${
            sidebarCollapsed ? "w-[72px]" : "w-[72px] md:w-64"
          }`}
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-3">
              <button
                type="button"
                onClick={toggleCollapsed}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 text-neutral-100 hover:border-neutral-500"
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  {sidebarCollapsed ? <path d="m8 5 8 7-8 7" /> : <path d="m16 5-8 7 8 7" />}
                </svg>
              </button>
              {!sidebarCollapsed ? (
                <h2 className="text-sm font-semibold tracking-wide text-neutral-200">YourBarrio Admin</h2>
              ) : null}
              <button
                type="button"
                onClick={togglePinned}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-md border ${
                  pinnedExpanded
                    ? "border-sky-700 bg-sky-950/60 text-sky-100"
                    : "border-neutral-700 bg-neutral-900 text-neutral-200 hover:border-neutral-500"
                }`}
                aria-label={pinnedExpanded ? "Unpin sidebar" : "Pin sidebar"}
                title={pinnedExpanded ? "Unpin sidebar" : "Pin sidebar"}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m9 4 6 6" />
                  <path d="m14 3 7 7" />
                  <path d="M11 8 4 15" />
                  <path d="M7 18 3 22" />
                  <path d="m16 10-6 6" />
                </svg>
              </button>
            </div>
            {sidebarCollapsed ? sidebarCollapsedContent : sidebarExpandedContent}
          </div>
        </aside>

        <div
          className={`h-screen min-w-0 flex-1 overflow-y-auto overflow-x-hidden pt-[calc(var(--admin-nav-h)+var(--yb-support-mode-offset,0px))] ${
            sidebarCollapsed ? "pl-[72px]" : "pl-[72px] md:pl-64"
          }`}
        >
          <div className="mx-auto w-full max-w-7xl px-4 pb-4 sm:px-6 lg:px-8">
            <main className="space-y-4 min-w-0">
              {statusContent}
              {children}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
