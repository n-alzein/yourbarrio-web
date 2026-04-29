"use client";

import Link from "next/link";
import { markAccountNavHandlerStart } from "@/lib/accountNavPerf";
import { markNavInProgress } from "@/lib/nav/safariNavGuard";

const variants = {
  orders: {
    container:
      "mb-1 flex items-center gap-5 border-b border-[rgba(15,23,42,0.08)]",
    active: {
      className:
        "inline-flex h-10 items-center justify-center border-b-2 border-transparent px-0 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/35 focus-visible:ring-offset-2",
      style: {
        color: "rgb(var(--brand-rgb))",
        borderBottomColor: "rgba(var(--brand-rgb), 0.52)",
      },
    },
    inactive: {
      className:
        "inline-flex h-10 items-center justify-center border-b-2 border-transparent px-0 text-sm font-medium transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/25 focus-visible:ring-offset-2",
      style: { color: "rgba(15, 23, 42, 0.62)" },
    },
  },
  history: {
    container:
      "mb-1 flex items-center gap-5 border-b border-[rgba(15,23,42,0.08)]",
    active: {
      className:
        "inline-flex h-10 items-center justify-center border-b-2 border-transparent px-0 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/35 focus-visible:ring-offset-2",
      style: {
        color: "rgb(var(--brand-rgb))",
        borderBottomColor: "rgba(var(--brand-rgb), 0.52)",
      },
    },
    inactive: {
      className:
        "inline-flex h-10 items-center justify-center border-b-2 border-transparent px-0 text-sm font-medium transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/25 focus-visible:ring-offset-2",
      style: { color: "rgba(15, 23, 42, 0.62)" },
    },
  },
};

export default function AccountNavTabs({ active = "orders", variant = "orders" }) {
  const config = variants[variant] || variants.orders;

  const handleClick = (id) => (event) => {
    markAccountNavHandlerStart(id, {
      href: event?.currentTarget?.getAttribute?.("href") || null,
    });
  };

  const handlePointerDown = (href) => () => {
    markNavInProgress(href);
  };

  const isOrders = active === "orders";

  return (
    <div className={config.container}>
      <Link
        href="/account/orders"
        aria-current={isOrders ? "page" : undefined}
        className={isOrders ? config.active.className : config.inactive.className}
        style={isOrders ? config.active.style : config.inactive.style}
        data-perf="account-nav"
        data-perf-id="orders"
        onClick={handleClick("orders")}
        onPointerDownCapture={handlePointerDown("/account/orders")}
      >
        Pending
      </Link>
      <Link
        href="/account/purchase-history"
        aria-current={!isOrders ? "page" : undefined}
        className={!isOrders ? config.active.className : config.inactive.className}
        style={!isOrders ? config.active.style : config.inactive.style}
        data-perf="account-nav"
        data-perf-id="history"
        onClick={handleClick("history")}
        onPointerDownCapture={handlePointerDown("/account/purchase-history")}
      >
        History
      </Link>
    </div>
  );
}
