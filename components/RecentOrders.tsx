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
  pending: "border-amber-200/70 bg-amber-50/80 text-amber-700",
  fulfilled: "border-emerald-200/60 bg-emerald-50/75 text-emerald-600",
  refunded: "border-rose-200/70 bg-rose-50/80 text-rose-700",
  on_hold: "border-slate-200/80 bg-slate-100/80 text-slate-600",
};

const RecentOrders = ({ orders }: RecentOrdersProps) => {
  const router = useRouter();
  return (
    <div className="dashboard-panel p-5 transition duration-200 hover:border-slate-300 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Fulfillment
          </p>
          <h3 className="text-lg font-semibold text-slate-900">Recent orders</h3>
        </div>
        <Link
          href="/business/orders"
          className="dashboard-toolbar-button px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:bg-white"
        >
          View all
        </Link>
      </div>
      <div className="dashboard-panel-inner mt-5 overflow-hidden">
        {orders.length === 0 ? (
          <div className="min-h-[200px] p-4">
            <DashboardEmptyState
              compact
              title="No orders yet"
              description="Customer purchases will start to appear here."
              secondaryAction={{ href: "/business/orders", label: "View orders" }}
              className="min-h-[168px] border-dashed bg-white"
            />
          </div>
        ) : (
          <div className="h-[300px] overflow-auto">
            <table className="dashboard-table dashboard-table--no-hover-dark w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50/80 text-[0.66rem] uppercase tracking-[0.18em] text-slate-400/85">
                <tr>
                  <th className="px-5 py-3.5 text-left">Order</th>
                  <th className="px-5 py-3.5 text-left">Customer</th>
                  <th className="px-5 py-3.5 text-right">Total</th>
                  <th className="px-5 py-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className={`border-t border-slate-200 ${
                      order.href ? "cursor-pointer hover:bg-slate-50/60" : ""
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
                    <td className="px-5 py-[1.15rem] font-semibold text-slate-900">
                      {order.href ? (
                        <Link href={order.href} className="hover:text-slate-700">
                          {order.id}
                        </Link>
                      ) : (
                        order.id
                      )}
                    </td>
                    <td className="px-5 py-[1.15rem] text-slate-600">
                      {order.customerName}
                      <div className="mt-1 text-xs text-slate-400">{order.items} items</div>
                    </td>
                    <td className="px-5 py-[1.15rem] text-right font-semibold text-slate-900">
                      {formatCurrency(order.total)}
                    </td>
                    <td className="px-5 py-[1.15rem] text-right">
                      <span
                        className={`dashboard-status-badge ${statusTone[order.status]}`}
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
