"use client";

import Link from "next/link";
import { formatEntityId } from "@/lib/entityIds";

/** @typedef {import("@/lib/types/orders").Order} Order */
/** @typedef {import("@/lib/types/cart").VendorSummary} VendorSummary */

const formatMoney = (value) => {
  const amount = Number(value || 0);
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const statusCopy = {
  pending_payment: "Pending payment",
  payment_failed: "Payment failed",
  requested: "Request received",
  confirmed: "Confirmed",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  fulfilled: "Fulfilled",
  completed: "Completed",
  cancelled: "Cancelled",
};

function ReceiptItemName({ item }) {
  const title = item?.title || "Item";
  const listingExists = Boolean(item?.listing_id && item?.listing?.id);

  if (!listingExists) {
    return (
      <span title={item?.listing_id ? "Item no longer available" : undefined}>
        {title}
      </span>
    );
  }

  return (
    <Link
      href={`/listings/${item.listing_id}`}
      aria-label={`View item details for ${title}`}
      className="group inline-flex max-w-full items-center gap-1 text-inherit no-underline hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <span className="min-w-0 break-words">{title}</span>
      <span
        aria-hidden="true"
        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70"
      >
        &rarr;
      </span>
    </Link>
  );
}

/** @param {{ order: Order, vendor: VendorSummary, purchasedAtLabel: string }} props */
export default function OrderReceiptClient({ order, vendor, purchasedAtLabel }) {
  const items = order?.order_items || [];
  const statusLabel = statusCopy[order?.status] || "Processing";
  const displayOrderId =
    formatEntityId("order", order?.order_number) || order?.order_number;

  return (
    <div className="min-h-screen px-4 md:px-8 lg:px-12 py-12" style={{ background: "var(--background)", color: "var(--text)" }}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.2em] opacity-70">Order confirmation</p>
          <h1 className="text-3xl font-semibold">Order {displayOrderId}</h1>
          <p className="text-sm opacity-80">Status: {statusLabel}</p>
          <p className="text-xs opacity-70 mb-3">
            Purchased {purchasedAtLabel}
          </p>
        </div>

        <div className="rounded-3xl p-6 space-y-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Receipt</p>
              <p className="text-xs opacity-70 mb-6">
                {order?.status === "pending_payment"
                  ? "Complete Stripe Checkout to finalize your payment."
                  : order?.status === "payment_failed"
                    ? "Stripe could not complete your payment."
                    : "Payment completed with Stripe."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-full px-4 py-2 text-xs font-semibold"
              style={{ background: "var(--text)", color: "var(--background)" }}
            >
              Print receipt
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-4 text-sm mt-4 md:mt-0">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.2em] opacity-60">Vendor</p>
              <p className="font-semibold">{vendor?.business_name || vendor?.full_name || "Local vendor"}</p>
              {vendor?.city ? <p className="text-xs opacity-70">{vendor.city}</p> : null}
            </div>
            <div className="space-y-0">
              <p className="text-xs uppercase tracking-[0.2em] opacity-60 mb-1">Fulfillment</p>
              {order?.fulfillment_type === "delivery" ? (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight">Delivery</p>
                    <p className="text-xs opacity-70 leading-tight">
                      {order.delivery_address1}
                      {order.delivery_address2 ? `, ${order.delivery_address2}` : ""}
                    </p>
                  </div>
                  {order?.delivery_instructions ? (
                    <div className="text-right">
                      <p className="uppercase tracking-[0.2em] text-[0.6rem] opacity-60">Delivery instructions</p>
                      <p className="mt-2 text-xs opacity-70">{order.delivery_instructions}</p>
                    </div>
                  ) : null}
                  {order?.delivery_notes_snapshot ? (
                    <div className="text-right">
                      <p className="uppercase tracking-[0.2em] text-[0.6rem] opacity-60">Delivery notes</p>
                      <p className="mt-2 text-xs opacity-70">{order.delivery_notes_snapshot}</p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs opacity-70 mb-3">
                  Pickup time: {order.pickup_time || "ASAP"}
                </p>
              )}
            </div>
          </div>

          <div className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col />
                  <col style={{ width: "3.5rem" }} />
                  <col style={{ width: "5.5rem" }} />
                  <col style={{ width: "5.5rem" }} />
                </colgroup>
                <thead className="text-xs uppercase tracking-[0.2em] opacity-60 leading-none">
                  <tr>
                    <th className="text-left font-medium pb-2">Item</th>
                    <th className="text-right font-medium pb-2">Qty</th>
                    <th className="text-right font-medium pb-2">Unit</th>
                    <th className="text-right font-medium pb-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="opacity-80 pr-2 py-1 break-words">
                        <div className="flex items-start gap-3">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt=""
                              className="h-11 w-11 shrink-0 rounded-lg object-cover"
                            />
                          ) : null}
                          <ReceiptItemName item={item} />
                        </div>
                      </td>
                      <td className="text-right py-1">{item.quantity}</td>
                      <td className="text-right py-1">
                        ${formatMoney(item.unit_price)}
                      </td>
                      <td className="text-right py-1">
                        ${formatMoney(Number(item.unit_price || 0) * Number(item.quantity || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-t mt-4 pt-4 space-y-2 text-sm" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between">
              <span className="opacity-80">Subtotal</span>
              <span>${formatMoney(order?.subtotal)}</span>
            </div>
            {Number(order?.delivery_fee_cents_snapshot || 0) > 0 ? (
              <div className="flex items-center justify-between">
                <span className="opacity-80">Delivery fee</span>
                <span>${formatMoney(Number(order?.delivery_fee_cents_snapshot || 0) / 100)}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <span className="opacity-80">Service fee</span>
              <span>${formatMoney(order?.fees)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold">Total</span>
              <span className="font-semibold">${formatMoney(order?.total)}</span>
            </div>
            <p className="text-xs opacity-70">
              {order?.status === "pending_payment"
                ? "Your order will move forward after Stripe confirms payment."
                : "The business will confirm fulfillment details next."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
