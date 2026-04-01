"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import DashboardEmptyState from "@/components/DashboardEmptyState";
import type { RecentOrder } from "@/lib/dashboardTypes";

type RecentOrdersProps = {
  orders: RecentOrder[];
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

const statusTone: Record<RecentOrder["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  fulfilled: "bg-emerald-100 text-emerald-700",
  refunded: "bg-rose-100 text-rose-700",
  on_hold: "bg-slate-100 text-slate-600",
};

const RecentOrders = ({ orders }: RecentOrdersProps) => {
  const router = useRouter();
  return (
    <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] transition duration-200 hover:border-slate-300/80 hover:shadow-[0_18px_36px_rgba(15,23,42,0.1)] sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Fulfillment
          </p>
          <h3 className="text-lg font-semibold text-slate-900">Recent orders</h3>
        </div>
        <Link
          href="/business/orders"
          className="rounded-full border border-slate-200/80 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300"
        >
          View all
        </Link>
      </div>
      <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200/60">
        {orders.length === 0 ? (
          <div className="min-h-[190px] p-4">
            <DashboardEmptyState
              compact
              title="No orders yet"
              description="Customer purchases will start to appear here."
              secondaryAction={{ href: "/business/orders", label: "View orders" }}
              className="min-h-[158px]"
            />
          </div>
        ) : (
          <div className="h-[300px] overflow-auto">
            <table className="dashboard-table dashboard-table--no-hover-dark w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Order</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className={`border-t border-slate-200 ${
                      order.href ? "cursor-pointer hover:bg-slate-50" : ""
                    }`}
                    onClick={() => {
                      if (order.href) router.push(order.href);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && order.href) {
                        router.push(order.href);
                      }
                    }}
                    tabIndex={order.href ? 0 : -1}
                    role={order.href ? "link" : "row"}
                  >
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {order.href ? (
                        <Link href={order.href} className="hover:text-slate-700">
                          {order.id}
                        </Link>
                      ) : (
                        order.id
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {order.customerName}
                      <div className="text-xs text-slate-600">{order.items} items</div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {formatCurrency(order.total)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${
                          statusTone[order.status]
                        }`}
                      >
                        {order.status.replace("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecentOrders;
