"use client";

import { Children, useMemo, useState, type ReactNode } from "react";
import AdminUserTabs, { type AdminUserTabKey } from "@/app/admin/users/[id]/_components/AdminUserTabs";

type AdminUserDetailLayoutProps = {
  header: ReactNode;
  flash?: ReactNode;
  aside: ReactNode;
  children: ReactNode;
};

const TABS: { key: AdminUserTabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "permissions", label: "Permissions" },
  { key: "security", label: "Security" },
  { key: "activity", label: "Activity" },
  { key: "notes", label: "Notes" },
];

export default function AdminUserDetailLayout({
  header,
  flash,
  aside,
  children,
}: AdminUserDetailLayoutProps) {
  const [activeTab, setActiveTab] = useState<AdminUserTabKey>("overview");
  const panels = useMemo(() => Children.toArray(children), [children]);

  return (
    <section className="space-y-8">
      {header}
      {flash}
      <AdminUserTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="grid gap-4 md:grid-cols-[minmax(320px,360px)_minmax(0,1fr)] md:gap-6">
        <aside className="min-w-0 md:sticky md:top-4 md:max-h-[calc(100vh-12rem)] md:overflow-y-auto">
          {aside}
        </aside>
        <div className="min-w-0 md:max-h-[calc(100vh-12rem)] md:overflow-y-auto md:pr-1">
          {TABS.map((tab, index) => {
            const isActive = tab.key === activeTab;
            return (
              <section key={tab.key} hidden={!isActive} className={!isActive ? "hidden" : "block"}>
                {panels[index] ?? (
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
