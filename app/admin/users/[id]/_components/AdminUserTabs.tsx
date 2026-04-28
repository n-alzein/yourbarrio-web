"use client";

export type AdminUserTabKey =
  | "overview"
  | "permissions"
  | "security"
  | "activity"
  | "notes"
  | "listings";

type AdminUserTabsProps = {
  tabs: { key: AdminUserTabKey; label: string }[];
  activeTab: AdminUserTabKey;
  onTabChange: (key: AdminUserTabKey) => void;
};

export default function AdminUserTabs({ tabs, activeTab, onTabChange }: AdminUserTabsProps) {
  return (
    <div className="overflow-x-auto">
      <div className="inline-flex min-w-full gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={`rounded px-3 py-2 text-sm whitespace-nowrap ${
                isActive
                  ? "border border-neutral-600 bg-neutral-800 text-neutral-100"
                  : "border border-transparent text-neutral-400 hover:text-neutral-200"
              }`}
              aria-pressed={isActive}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
