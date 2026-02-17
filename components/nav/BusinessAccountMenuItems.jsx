"use client";

import Link from "next/link";
import { Settings } from "lucide-react";

export default function BusinessAccountMenuItems({
  items = [],
  unreadCount = 0,
  onNavigate,
  logout = null,
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="yb-sidebar-section-title">
          Business
        </p>
        <div className="mt-3 space-y-1">
          {items.map(({ href, title, description, icon: Icon, showBadge }) => (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className="yb-sidebar-item flex w-full items-start gap-3 px-3 py-3 text-left transition"
              data-safe-nav="1"
            >
              <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--yb-border)] bg-white">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{title}</span>
                  {showBadge && unreadCount > 0 ? (
                    <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                      {unreadCount}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-xs yb-dropdown-muted">
                  {description}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <p className="yb-sidebar-section-title">
          Account
        </p>
        <div className="mt-3 space-y-1">
          <Link
            href="/go/account"
            onClick={onNavigate}
            className="yb-sidebar-item flex w-full items-start gap-3 px-3 py-3 text-left transition"
            data-safe-nav="1"
          >
            <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--yb-border)] bg-white">
              <Settings className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-sm font-semibold">Account settings</span>
              <span className="mt-1 block text-xs yb-dropdown-muted">
                Manage billing and preferences
              </span>
            </span>
          </Link>
        </div>
      </div>

      {logout ? <div className="border-t border-[var(--yb-border)] pt-4">{logout}</div> : null}
    </div>
  );
}
