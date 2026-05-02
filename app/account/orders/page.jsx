import Link from "next/link";
import AccountNavTabs from "@/components/account/AccountNavTabs";
import OrderItemThumbnails from "./OrderItemThumbnails";
import {
  formatMoney,
  formatOrderDateTime,
  getOrderStatusDescription,
  getOrderStatusLabel,
} from "@/lib/orders";
import { formatEntityId } from "@/lib/entityIds";
import { requireRole } from "@/lib/auth/server";
import { getSupportAwareClient } from "@/lib/support/supportAwareData";
import { CUSTOMER_ACTIVE_ORDER_STATUSES } from "@/lib/orders/customerVisibility";

const STATUS_DOT_STYLES = {
  requested: { background: "#d97706" },
  confirmed: { background: "#2563eb" },
  ready: { background: "#0f766e" },
  out_for_delivery: { background: "#0f766e" },
};

function isMeaningfullyDifferentTimestamp(base, compare) {
  if (!base || !compare) return false;

  const baseTime = new Date(base).getTime();
  const compareTime = new Date(compare).getTime();

  if (!Number.isFinite(baseTime) || !Number.isFinite(compareTime)) return false;

  return Math.abs(compareTime - baseTime) >= 15 * 60 * 1000;
}

export default async function AccountOrdersPage({ searchParams }) {
  await requireRole("customer");
  const { client, effectiveUserId } = await getSupportAwareClient({
    expectedRole: "customer",
    feature: "orders",
  });
  const resolvedParams =
    searchParams && typeof searchParams.then === "function"
      ? await searchParams
      : searchParams;
  const page = Math.max(Number(resolvedParams?.page || 1), 1);
  const limit = 8;
  const from = (page - 1) * limit;
  const to = from + limit;

  const { data: orders, error } = await client
    .from("orders")
    .select(
      "id,order_number,created_at,updated_at,status,fulfillment_type,delivery_time,pickup_time,total, vendor:users!orders_vendor_id_fkey (business_name, full_name), order_items(id,title,image_url,created_at, listing:listings!order_items_listing_id_fkey(photo_url,photo_variants,cover_image_id))"
    )
    .eq("user_id", effectiveUserId)
    .in("status", CUSTOMER_ACTIVE_ORDER_STATUSES)
    .not("paid_at", "is", null)
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  const rows = orders || [];
  const hasMore = rows.length > limit;
  const visibleRows = hasMore ? rows.slice(0, limit) : rows;

  return (
    <div
      className="min-h-screen px-4 pb-12 md:px-8 lg:px-12"
      style={{ background: "var(--background)", color: "var(--text)" }}
    >
      <div className="mx-auto max-w-5xl space-y-7">
        <div className="space-y-2.5">
          <p className="text-xs uppercase tracking-[0.2em] opacity-70">
            Orders
          </p>
          <h1 className="text-3xl font-semibold">My orders</h1>
          <p className="text-sm opacity-70">
            Track active paid orders and check the latest updates.
          </p>
        </div>

        <AccountNavTabs active="orders" variant="orders" />

        {error ? (
          <div
            className="rounded-2xl p-4 text-sm text-rose-600"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            {error.message || "Failed to load orders."}
          </div>
        ) : null}

        {visibleRows.length === 0 ? (
          <div
            className="rounded-3xl p-8 text-center"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <h2 className="text-xl font-semibold">No active orders yet.</h2>
            <p className="mt-2 text-sm opacity-80">
              Orders you place will appear here after payment is confirmed.
            </p>
            <Link
              href="/customer/home"
              className="mt-5 inline-flex items-center justify-center rounded-full px-5 h-11 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 focus-visible:ring-offset-2"
              style={{ background: "var(--text)", color: "var(--background)" }}
            >
              Back to marketplace
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {visibleRows.map((order) => {
              const vendorName =
                order?.vendor?.business_name ||
                order?.vendor?.full_name ||
                "Local vendor";
              const fulfillmentLabel =
                order.fulfillment_type === "delivery" ? "Delivery" : "Pickup";
              const schedule =
                order.fulfillment_type === "delivery"
                  ? order.delivery_time
                  : order.pickup_time;
              const scheduleLabel =
                schedule && schedule.toLowerCase() === "asap"
                  ? "ASAP"
                  : schedule || "ASAP";
              const lastUpdate = order.updated_at || order.created_at;
              const displayOrderId =
                formatEntityId("order", order.order_number) || order.order_number;
              const statusLabel = getOrderStatusLabel(order.status);
              const hasMeaningfulUpdate = isMeaningfullyDifferentTimestamp(
                order.created_at,
                lastUpdate
              );
              const statusTimestamp = hasMeaningfulUpdate
                ? formatOrderDateTime(lastUpdate)
                : formatOrderDateTime(order.created_at);
              return (
                <Link
                  key={order.id}
                  href={`/orders/${order.order_number}`}
                  aria-label={`View details for order ${displayOrderId} from ${vendorName}`}
                  className="group cursor-pointer rounded-[28px] border bg-white/95 px-4 py-3.5 shadow-[0_10px_24px_-28px_rgba(15,23,42,0.18)] transition-[background-color,border-color,box-shadow,transform] hover:bg-[rgba(248,250,252,0.95)] hover:border-[rgba(15,23,42,0.09)] active:bg-[rgba(241,245,249,0.95)] active:scale-[0.998] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/30 focus-visible:ring-offset-2 sm:px-5 sm:py-4"
                  style={{
                    borderColor: "rgba(15, 23, 42, 0.06)",
                  }}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                    <div className="min-w-0 flex-1 space-y-2.5">
                      <div className="grid grid-cols-[auto,minmax(0,1fr)] items-start gap-4 sm:flex sm:min-w-0 sm:items-start sm:gap-[1.125rem]">
                        <OrderItemThumbnails order={order} />
                        <div className="min-w-0 space-y-0.5">
                          <p className="truncate text-base font-semibold text-slate-950 sm:text-[1.05rem]">
                            {vendorName}
                          </p>
                          <p className="text-xs text-slate-500">
                            Order {displayOrderId}
                          </p>
                          <p className="text-xs text-slate-500">
                            Placed {formatOrderDateTime(order.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium leading-5 text-slate-600">
                          <span className="inline-flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className="h-2 w-2 rounded-full"
                              style={
                                STATUS_DOT_STYLES[order.status] || {
                                  background: "rgba(15, 23, 42, 0.45)",
                                }
                              }
                            />
                            <span className="text-slate-900">{statusLabel}</span>
                          </span>
                          <span className="text-slate-400" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-slate-500">
                            {statusTimestamp}
                          </span>
                        </p>
                        <p className="text-sm leading-5 text-slate-600">
                          {fulfillmentLabel} · {scheduleLabel}
                        </p>
                        {hasMeaningfulUpdate ? (
                          <p className="text-xs text-slate-500">
                            {getOrderStatusDescription(order.status)}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center justify-between gap-4 border-t border-[rgba(15,23,42,0.08)] pt-3.5 sm:min-w-[150px] sm:flex-col sm:items-end sm:justify-start sm:border-t-0 sm:pt-0">
                      <span className="text-base font-semibold text-slate-950">
                        ${formatMoney(order.total)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-[rgba(var(--brand-rgb),0.9)] transition-colors group-hover:text-[rgb(var(--brand-rgb))]">
                        View details
                        <span aria-hidden="true">→</span>
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {hasMore ? (
          <div className="flex justify-center">
            <Link
              href={`/account/orders?page=${page + 1}`}
              className="rounded-full border px-4 h-10 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 focus-visible:ring-offset-2"
              style={{ borderColor: "var(--border)" }}
            >
              Load more
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
