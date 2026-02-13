"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import AdminMobileSidebarDrawer from "@/app/admin/_components/AdminMobileSidebarDrawer";
import { useLocalStorageState } from "@/lib/hooks/useLocalStorageState";
import AdminNavbar from "@/components/nav/AdminNavbar";

type AdminShellClientProps = {
  children: ReactNode;
  sidebarExpandedContent: ReactNode;
  sidebarCollapsedContent: ReactNode;
  statusContent?: ReactNode;
};

export default function AdminShellClient({
  children,
  sidebarExpandedContent,
  sidebarCollapsedContent,
  statusContent = null,
}: AdminShellClientProps) {
  const [collapsed, setCollapsed] = useLocalStorageState("yb.admin.sidebar.collapsed", false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarCollapsed = collapsed;
  const toggleCollapsed = () => setCollapsed((prev) => !prev);

  return (
    <div
      className="yb-admin-root yb-admin-shell min-h-screen bg-neutral-950 text-neutral-100"
      style={{ ["--admin-nav-h" as string]: "80px" }}
    >
      <AdminNavbar onOpenMobileSidebar={() => setMobileOpen(true)} />

      <aside
        className={`fixed left-0 hidden md:block z-[4000] overflow-y-auto border-r border-neutral-800 bg-neutral-950/95 transition-[width] duration-200 top-[calc(var(--admin-nav-h)+var(--yb-support-mode-offset,0px))] h-[calc(100vh-var(--admin-nav-h)-var(--yb-support-mode-offset,0px))] ${
          sidebarCollapsed ? "w-16" : "w-64"
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
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                {sidebarCollapsed ? <path d="m8 5 8 7-8 7" /> : <path d="m16 5-8 7 8 7" />}
              </svg>
            </button>
            {!sidebarCollapsed ? (
              <h2 className="text-sm font-semibold tracking-wide text-neutral-200">YourBarrio Admin</h2>
            ) : null}
            <div className="h-9 w-9" aria-hidden="true" />
          </div>
          {sidebarCollapsed ? sidebarCollapsedContent : sidebarExpandedContent}
        </div>
      </aside>

      <div
        className={`min-w-0 overflow-x-hidden ${
          sidebarCollapsed ? "md:pl-16" : "md:pl-64"
        }`}
        style={{ paddingTop: "calc(var(--admin-nav-h) + var(--yb-support-mode-offset, 0px))" }}
      >
        <div className="mx-auto w-full max-w-7xl px-4 pb-4 sm:px-6 lg:px-8">
          <main className="space-y-4 min-w-0">
            {statusContent}
            {children}
          </main>
        </div>
      </div>

      <AdminMobileSidebarDrawer open={mobileOpen} onOpenChange={setMobileOpen}>
        {sidebarExpandedContent}
      </AdminMobileSidebarDrawer>
    </div>
  );
}
