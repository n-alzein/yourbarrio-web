import AccountNavTabs from "@/components/account/AccountNavTabs";
import CustomerAccountShell from "@/components/customer/CustomerAccountShell";
import OrderEmptyState from "@/app/account/OrderEmptyState";
import Link from "next/link";
import OrderItemThumbnails from "./OrderItemThumbnails";
import {
  formatMoney,
  formatOrderDateTime,
  getOrderStatusDescription,
  getOrderStatusLabel,
} from "@/lib/orders";
import { formatLocalDateLabel } from "@/lib/utils/datetime";
import { formatEntityId } from "@/lib/entityIds";
import { requireRole } from "@/lib/auth/server";
import { getSupportAwareClient } from "@/lib/support/supportAwareData";
import { CUSTOMER_ACTIVE_ORDER_STATUSES } from "@/lib/orders/customerVisibility";

const STATUS_DOT_STYLES = {
  requested: { background: "#f59e0b" },
  confirmed: { background: "#3b82f6" },
  ready: { background: "#22c55e" },
  out_for_delivery: { background: "#22c55e" },
  fulfilled: { background: "#22c55e" },
  completed: { background: "#22c55e" },
  cancelled: { background: "#ef4444" },
};

const COMPACT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const COMPACT_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatCompactOrderDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return formatLocalDateLabel(value);

  return COMPACT_DATE_FORMATTER.format(parsed);
}

function formatCompactOrderDateTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return formatOrderDateTime(value);

  return COMPACT_DATE_TIME_FORMATTER.format(parsed);
}

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
    <div className="min-h-screen bg-[#f6f7fb] pb-12 text-slate-950">
      <CustomerAccountShell className="space-y-7">
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

        <div className="pt-4">
          {error ? (
            <div
              className="rounded-2xl p-4 text-sm text-rose-600"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              {error.message || "Failed to load orders."}
            </div>
          ) : null}

          {visibleRows.length === 0 ? (
            <OrderEmptyState
              icon="active"
              title="No active orders yet."
              description="Orders you place will appear here after payment is confirmed."
              ctaLabel="Back to marketplace"
            />
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
                ? formatCompactOrderDateTime(lastUpdate)
                : formatCompactOrderDateTime(order.created_at);
              const placedDateLabel = formatCompactOrderDate(order.created_at);
              return (
                <Link
                  key={order.id}
                  href={`/orders/${order.order_number}`}
                  aria-label={`View details for order ${displayOrderId} from ${vendorName}`}
                  className="group cursor-pointer rounded-3xl border bg-white/95 px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[background-color,border-color,box-shadow,transform] hover:bg-[rgba(248,250,252,0.95)] hover:border-[rgba(15,23,42,0.07)] active:bg-[rgba(241,245,249,0.95)] active:scale-[0.998] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/30 focus-visible:ring-offset-2 sm:px-5 sm:py-4"
                  style={{
                    borderColor: "rgba(15, 23, 42, 0.05)",
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
                          <p className="text-sm font-normal text-slate-500">
                            {displayOrderId} · {placedDateLabel}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold leading-5 text-slate-700">
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
                            <span className="text-slate-950">{statusLabel}</span>
                          </span>
                          <span className="text-slate-400" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-slate-700">
                            {statusTimestamp}
                          </span>
                        </p>
                        <p className="text-sm leading-5 text-slate-500">
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
                      <span className="inline-flex items-center gap-1 text-sm font-normal text-slate-600 transition-colors group-hover:text-[rgba(var(--brand-rgb),0.9)]">
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
        </div>

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
      </CustomerAccountShell>
    </div>
  );
}
