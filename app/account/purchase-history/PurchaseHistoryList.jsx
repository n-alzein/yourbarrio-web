import Link from "next/link";
import {
  formatMoney,
  formatOrderPurchaseTime,
  getOrderStatusLabel,
  groupOrdersByPurchaseDate,
} from "@/lib/orders";
import { formatEntityId } from "@/lib/entityIds";
import {
  getOrderItemThumbnailUrl,
  getOrderThumbnailItems,
} from "@/lib/orders/itemThumbnails";

const getVendorName = (order) =>
  order?.vendor?.business_name || order?.vendor?.full_name || "Local vendor";

const getOrderThumbnailUrl = (order) => {
  const item = Array.isArray(order?.order_items) ? order.order_items[0] : null;
  return getOrderItemThumbnailUrl(item);
};

function MultiItemThumbnailPreview({ order }) {
  const { items, overflowCount } = getOrderThumbnailItems(order, 3);
  const lastIndex = items.length - 1;

  return (
    <div className="flex h-16 w-[6.75rem] shrink-0 items-center" aria-hidden="true">
      {items.map((item, index) => {
        const showOverflow = overflowCount > 0 && index === lastIndex;

        return (
          <div
            key={item.key}
            className={`relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border bg-white ${index > 0 ? "-ml-3" : ""}`}
            style={{ borderColor: "var(--border)" }}
          >
            {item.url ? (
              <img
                src={item.url}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <div
                className="h-full w-full"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(15, 23, 42, 0.06), rgba(15, 23, 42, 0.02))",
                }}
              />
            )}
            {showOverflow ? (
              <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-xs font-semibold text-white">
                +{overflowCount}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function SubtleStatus({ status }) {
  if (!status || status === "fulfilled") return null;

  return (
    <span className="text-xs font-medium opacity-70">
      {getOrderStatusLabel(status)}
    </span>
  );
}

export default function PurchaseHistoryList({ orders }) {
  const groups = groupOrdersByPurchaseDate(orders || []);

  return (
    <div className="space-y-7">
      {groups.map((group) => (
        <section key={group.key} className="space-y-2.5 first:mt-0 mt-8" aria-labelledby={`purchase-date-${group.key}`}>
          <div className="flex items-center gap-3">
            <h2
              id={`purchase-date-${group.key}`}
              className="text-xs font-semibold uppercase tracking-[0.18em] opacity-60"
            >
              {group.label}
            </h2>
            <div className="h-px flex-1" style={{ background: "var(--border)" }} />
          </div>

          <div className="flex flex-col gap-3.5">
            {group.orders.map((order) => {
              const vendorName = getVendorName(order);
              const thumbnailUrl = getOrderThumbnailUrl(order);
              const isMultiItemOrder = Array.isArray(order?.order_items) && order.order_items.length > 1;
              const displayOrderId =
                formatEntityId("order", order.order_number) || order.order_number;

              return (
                <Link
                  key={order.id}
                  href={`/orders/${order.order_number}`}
                  aria-label={`View receipt for order ${displayOrderId} from ${vendorName}`}
                  className="group rounded-3xl px-4 py-4 md:px-5 flex items-center justify-between gap-4 transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    outlineColor: "var(--text)",
                  }}
                >
                  <div className="min-w-0 flex items-center gap-4">
                    {isMultiItemOrder ? (
                      <MultiItemThumbnailPreview order={order} />
                    ) : thumbnailUrl ? (
                        <img
                          src={thumbnailUrl}
                          alt=""
                          loading="lazy"
                          className="h-16 w-16 shrink-0 rounded-xl object-cover"
                        />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="h-16 w-16 shrink-0 rounded-xl"
                        style={{
                          background:
                            "linear-gradient(135deg, rgba(15, 23, 42, 0.06), rgba(15, 23, 42, 0.02))",
                          border: "1px solid rgba(15, 23, 42, 0.06)",
                        }}
                      />
                    )}

                    <div className="min-w-0 space-y-1.5">
                      <p className="text-base font-semibold truncate">{vendorName}</p>
                      <p className="text-xs opacity-70">
                        Order {displayOrderId} · {formatOrderPurchaseTime(order)}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center justify-end gap-3 text-sm text-right">
                    <SubtleStatus status={order.status} />
                    <span className="text-base font-semibold">${formatMoney(order.total)}</span>
                    <span className="text-lg leading-none opacity-35 transition-opacity group-hover:opacity-70" aria-hidden="true">
                      &gt;
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
