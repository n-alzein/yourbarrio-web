"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  PackageSearch,
  Settings,
  Store,
  UserSquare2,
} from "lucide-react";

const primaryLinks = [
  {
    href: "/business/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/business/orders",
    label: "Orders",
    icon: PackageSearch,
  },
  {
    href: "/business/messages",
    label: "Messages",
    icon: MessageSquare,
  },
  {
    href: "/business/listings",
    label: "Manage listings",
    icon: Store,
  },
];

const secondaryLinks = [
  {
    href: "/business/profile",
    label: "Business Profile",
    icon: UserSquare2,
  },
  {
    href: "/business/settings",
    label: "Account settings",
    icon: Settings,
  },
];

function isActivePath(pathname, href) {
  if (!pathname) return false;
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

function BusinessSidebarLink({ href, label, icon: Icon }) {
  const pathname = usePathname();
  const active = isActivePath(pathname, href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--brand-rgb),0.35)] focus-visible:ring-offset-2 ${
        active
          ? "bg-[rgba(var(--brand-rgb),0.07)] text-[rgb(var(--brand-rgb))]"
          : "text-slate-600 hover:bg-slate-50/80 hover:text-slate-950"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}

export default function BusinessAccountShell({ children }) {
  return (
    <div className="mx-auto w-full max-w-[1520px] bg-[#f6f7fb] px-0 pt-4 lg:min-h-[calc(100vh-var(--yb-nav-content-offset,80px))] lg:px-8">
      <div className="bg-[#f6f7fb] lg:grid lg:min-h-[calc(100vh-var(--yb-nav-content-offset,80px))] lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-8">
        <aside className="hidden lg:block">
          <nav
            aria-label="Business account navigation"
            className="sticky top-[calc(var(--yb-nav-content-offset,80px)+1.25rem)] rounded-3xl border border-slate-100 bg-white/90 p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
          >
            <div className="px-3 pb-2 pt-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Business
              </p>
            </div>
            <div className="space-y-1">
              {primaryLinks.map((link) => (
                <BusinessSidebarLink key={link.href} {...link} />
              ))}
            </div>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="space-y-1">
                {secondaryLinks.map((link) => (
                  <BusinessSidebarLink key={link.href} {...link} />
                ))}
              </div>
            </div>
          </nav>
        </aside>
        <main className="min-w-0 bg-[#f6f7fb]">{children}</main>
      </div>
    </div>
  );
}
