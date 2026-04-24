import Link from "next/link";
import AccountNavTabs from "@/components/account/AccountNavTabs";
import OrderStatusBadge from "@/components/orders/OrderStatusBadge";
import OrderItemThumbnails from "./OrderItemThumbnails";
import {
  formatMoney,
  formatOrderDateTime,
  getOrderStatusDescription,
} from "@/lib/orders";
import { formatEntityId } from "@/lib/entityIds";
import { requireRole } from "@/lib/auth/server";
import { getSupportAwareClient } from "@/lib/support/supportAwareData";

const PENDING_STATUSES = [
  "pending_payment",
  "payment_failed",
  "requested",
  "confirmed",
  "ready",
  "out_for_delivery",
];

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
      "id,order_number,created_at,updated_at,status,fulfillment_type,delivery_time,pickup_time,total, vendor:users!orders_vendor_id_fkey (business_name, full_name), order_items(id,title,image_url,created_at, listing:listings!order_items_listing_id_fkey(photo_url,photo_variants))"
    )
    .eq("user_id", effectiveUserId)
    .in("status", PENDING_STATUSES)
    .order("created_at", { ascending: false })
    .range(from, to);

  const rows = orders || [];
  const hasMore = rows.length > limit;
  const visibleRows = hasMore ? rows.slice(0, limit) : rows;

  return (
    <div
      className="min-h-screen px-4 md:px-8 lg:px-12 pt-0 pb-12"
      style={{ background: "var(--background)", color: "var(--text)" }}
    >
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] opacity-70">
            Orders
          </p>
          <h1 className="text-3xl font-semibold">My orders</h1>
          <p className="text-sm opacity-70 mt-2 mb-4">
            Track active orders and check the latest updates.
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
            <h2 className="text-xl font-semibold">No pending orders</h2>
            <p className="mt-2 text-sm opacity-80">
              Browse the marketplace to start a new order.
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
              return (
                <div
                  key={order.id}
                  className="rounded-3xl p-6 space-y-5"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3.5 min-w-0">
                      <OrderItemThumbnails order={order} />
                      <div className="space-y-1 min-w-0">
                        <p className="text-sm font-semibold">
                          Order {displayOrderId}
                        </p>
                        <p className="text-xs opacity-70">{vendorName}</p>
                        <p className="text-xs opacity-70">
                          Placed {formatOrderDateTime(order.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 md:justify-end">
                      <OrderStatusBadge status={order.status} />
                      <span className="text-sm font-semibold">
                        ${formatMoney(order.total)}
                      </span>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4 text-sm mt-4">
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-[0.2em] opacity-60">
                        Status update
                      </p>
                      <p className="font-semibold">
                        {getOrderStatusDescription(order.status)}
                      </p>
                      <p className="text-xs opacity-70 mt-2">
                        Updated {formatOrderDateTime(lastUpdate)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-[0.2em] opacity-60">
                        Fulfillment
                      </p>
                      <p className="font-semibold">{fulfillmentLabel}</p>
                      <p className="text-xs opacity-70 mt-2">{scheduleLabel}</p>
                    </div>
                    <div className="flex md:justify-end items-center">
                      <Link
                        href={`/orders/${order.order_number}`}
                        className="inline-flex items-center justify-center rounded-full px-5 h-11 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 focus-visible:ring-offset-2"
                        style={{ background: "var(--text)", color: "var(--background)" }}
                      >
                        View details
                      </Link>
                    </div>
                  </div>
                </div>
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
