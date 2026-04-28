"use client";

import { Children, useMemo, useState, type ReactNode } from "react";
import AdminUserTabs, { type AdminUserTabKey } from "@/app/admin/users/[id]/_components/AdminUserTabs";

type AdminUserDetailLayoutProps = {
  header: ReactNode;
  flash?: ReactNode;
  aside: ReactNode;
  children: ReactNode;
  canSeePermissionsTab?: boolean;
  canSeeSecurityTab?: boolean;
  canSeeListingsTab?: boolean;
};

const TABS: { key: AdminUserTabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "permissions", label: "Permissions" },
  { key: "security", label: "Security" },
  { key: "listings", label: "Listings" },
  { key: "activity", label: "Activity" },
  { key: "notes", label: "Notes" },
];

export default function AdminUserDetailLayout({
  header,
  flash,
  aside,
  children,
  canSeePermissionsTab = false,
  canSeeSecurityTab = false,
  canSeeListingsTab = false,
}: AdminUserDetailLayoutProps) {
  const [activeTab, setActiveTab] = useState<AdminUserTabKey>("overview");
  const tabs = useMemo(() => {
    return TABS.filter((tab) => {
      if (tab.key === "permissions" && !canSeePermissionsTab) return false;
      if (tab.key === "security" && !canSeeSecurityTab) return false;
      if (tab.key === "listings" && !canSeeListingsTab) return false;
      return true;
    });
  }, [canSeeListingsTab, canSeePermissionsTab, canSeeSecurityTab]);
  const panelByKey = useMemo(() => {
    const allPanels = Children.toArray(children);
    const map = new Map<AdminUserTabKey, ReactNode>();
    TABS.forEach((tab, index) => {
      map.set(tab.key, allPanels[index] ?? null);
    });
    return map;
  }, [children]);

  const effectiveActiveTab = useMemo(() => {
    if (activeTab === "permissions" && !canSeePermissionsTab) return "overview";
    if (activeTab === "security" && !canSeeSecurityTab) return "overview";
    if (activeTab === "listings" && !canSeeListingsTab) return "overview";
    return activeTab;
  }, [activeTab, canSeeListingsTab, canSeePermissionsTab, canSeeSecurityTab]);

  return (
    <section className="space-y-8">
      {header}
      {flash}
      <AdminUserTabs tabs={tabs} activeTab={effectiveActiveTab} onTabChange={setActiveTab} />

      <div className="grid gap-4 md:grid-cols-[minmax(320px,360px)_minmax(0,1fr)] md:gap-6">
        <aside className="min-w-0 md:sticky md:top-4 md:max-h-[calc(100vh-12rem)] md:overflow-y-auto">
          {aside}
        </aside>
        <div className="min-w-0 md:max-h-[calc(100vh-12rem)] md:overflow-y-auto md:pr-1">
          {tabs.map((tab) => {
            const isActive = tab.key === effectiveActiveTab;
            return (
              <section key={tab.key} hidden={!isActive} className={!isActive ? "hidden" : "block"}>
                {panelByKey.get(tab.key) ?? (
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
                    This section is not available yet.
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
