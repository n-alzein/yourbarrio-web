"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Heart,
  History,
  MessageSquare,
  PackageSearch,
  Settings,
} from "lucide-react";

const links = [
  {
    href: "/account/orders",
    label: "My Orders",
    icon: PackageSearch,
  },
  {
    href: "/account/purchase-history",
    label: "Purchase History",
    icon: History,
  },
  {
    href: "/customer/messages",
    label: "Messages",
    icon: MessageSquare,
  },
  {
    href: "/customer/saved",
    label: "Saved items",
    icon: Heart,
  },
  {
    href: "/customer/settings",
    label: "Account settings",
    icon: Settings,
  },
];

function isActivePath(pathname, href) {
  if (!pathname) return false;
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export default function CustomerAccountShell({ children, className = "" }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto w-full max-w-[1520px] bg-[#f6f7fb] px-4 pt-4 sm:px-6 lg:min-h-[calc(100vh-var(--yb-nav-content-offset,80px))] lg:px-8">
      <div className="bg-[#f6f7fb] lg:grid lg:min-h-[calc(100vh-var(--yb-nav-content-offset,80px))] lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-8">
        <aside className="hidden lg:block">
          <nav
            aria-label="Account navigation"
            className="sticky top-[calc(var(--yb-nav-content-offset,80px)+1.25rem)] rounded-3xl border border-slate-100 bg-white/90 p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
          >
            <div className="px-3 pb-2 pt-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Account
              </p>
            </div>
            <div className="space-y-1">
              {links.map(({ href, label, icon: Icon }) => {
                const active = isActivePath(pathname, href);
                return (
                  <Link
                    key={href}
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
              })}
            </div>
          </nav>
        </aside>
        <main className={`min-w-0 bg-[#f6f7fb]${className ? ` ${className}` : ""}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
