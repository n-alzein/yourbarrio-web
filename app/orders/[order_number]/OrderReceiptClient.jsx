"use client";

import Link from "next/link";
import { formatEntityId } from "@/lib/entityIds";
import { getOrderStatusDescription, getOrderStatusLabel } from "@/lib/orders";

/** @typedef {import("@/lib/types/orders").Order} Order */
/** @typedef {import("@/lib/types/cart").VendorSummary} VendorSummary */

const formatMoney = (value) => {
  const amount = Number(value || 0);
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const STATUS_DOT_STYLES = {
  requested: { background: "#d97706" },
  pending_payment: { background: "rgba(110, 52, 255, 0.72)" },
  payment_failed: { background: "#b45309" },
  confirmed: { background: "#2563eb" },
  ready: { background: "#0f766e" },
  out_for_delivery: { background: "#0f766e" },
  fulfilled: { background: "#15803d" },
  completed: { background: "#15803d" },
  cancelled: { background: "#b91c1c" },
};

const NEXT_STEPS_COPY = {
  pending_payment: "Complete checkout to place the order.",
  payment_failed: "Complete checkout to place the order.",
  requested:
    "The business will review your order and confirm pickup details. You'll be notified when it's ready.",
  confirmed:
    "The business has confirmed your order and will share the next fulfillment update soon.",
  ready: "Your order is ready. Head to the business when you're able.",
  out_for_delivery: "Your order is on the way. Keep an eye out for delivery updates.",
  fulfilled: "This order has been completed.",
  completed: "This order has been completed.",
  cancelled: "This order has been cancelled.",
};

function getFulfillmentSummary(order) {
  if (order?.fulfillment_type === "delivery") {
    return `Delivery · ${order?.delivery_time || "ASAP"}`;
  }

  return `Pickup · ${order?.pickup_time || "ASAP"}`;
}

function getPaymentSummary(order) {
  if (order?.status === "pending_payment") {
    return "Complete Stripe Checkout to finalize your payment.";
  }

  if (order?.status === "payment_failed") {
    return "Stripe could not complete your payment.";
  }

  return "Payment completed with Stripe.";
}

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

function StatusHeader({
  order,
  mode,
  displayOrderId,
  statusTimestampLabel,
}) {
  const statusLabel = getOrderStatusLabel(order?.status);
  const statusDescription = getOrderStatusDescription(order?.status);
  const isCheckoutMode = mode === "checkout";

  return (
    <section className="space-y-7">
      <div className="space-y-2.5">
        {!isCheckoutMode ? (
          <p className="text-[11px] tracking-[0.16em] text-slate-400">Order details</p>
        ) : null}
        <h1 className="text-3xl font-semibold text-slate-950">
          {isCheckoutMode ? "Order confirmed" : `Order ${displayOrderId}`}
        </h1>
        <p className="text-sm text-slate-500">Order {displayOrderId}</p>
        <p className="text-sm text-slate-600">
          {isCheckoutMode
            ? "We received your order and payment."
            : statusDescription}
        </p>
      </div>

      <div className="space-y-2.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-5 text-slate-600">
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full"
              style={
                STATUS_DOT_STYLES[order?.status] || {
                  background: "rgba(15, 23, 42, 0.45)",
                }
              }
            />
            <span className="font-medium text-slate-900">{statusLabel}</span>
          </span>
          <span className="text-slate-400" aria-hidden="true">
            ·
          </span>
          <span className="text-slate-500">{statusTimestampLabel}</span>
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm leading-6 text-slate-600">
          {NEXT_STEPS_COPY[order?.status] || "We'll keep you posted on the next update."}
        </p>
      </div>
    </section>
  );
}

/** @param {{ order: Order, vendor: VendorSummary, purchasedAtLabel: string, statusTimestampLabel: string, mode: "checkout" | "details" }} props */
export default function OrderReceiptClient({
  order,
  vendor,
  purchasedAtLabel,
  statusTimestampLabel,
  mode = "details",
}) {
  const items = order?.order_items || [];
  const displayOrderId =
    formatEntityId("order", order?.order_number) || order?.order_number;
  const fulfillmentSummary = getFulfillmentSummary(order);
  const paymentSummary = getPaymentSummary(order);
  const isCheckoutMode = mode === "checkout";

  return (
    <div className="min-h-screen px-4 md:px-8 lg:px-12 py-12" style={{ background: "var(--background)", color: "var(--text)" }}>
      <div className="max-w-4xl mx-auto space-y-10">
        <StatusHeader
          order={order}
          mode={mode}
          displayOrderId={displayOrderId}
          statusTimestampLabel={statusTimestampLabel}
        />

        <div
          className="rounded-3xl p-6 space-y-4"
          style={{
            background: "var(--surface)",
            border: "1px solid rgba(15, 23, 42, 0.06)",
          }}
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                {isCheckoutMode ? "Receipt" : "Receipt and payment"}
              </p>
              <p className="text-xs opacity-70 mb-6">
                {paymentSummary}
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-8 items-center justify-center rounded-full border px-2.5 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/30 focus-visible:ring-offset-2"
              style={{ borderColor: "rgba(15, 23, 42, 0.08)" }}
            >
              Print receipt
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-4 text-sm mt-4 md:mt-0">
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-slate-500">Vendor</p>
              <p className="font-semibold">{vendor?.business_name || vendor?.full_name || "Local vendor"}</p>
              {vendor?.city ? <p className="text-xs opacity-70">{vendor.city}</p> : null}
            </div>
            <div className="space-y-0">
              <p className="mb-1 text-[11px] font-medium text-slate-500">Fulfillment</p>
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
                      <p className="text-[0.65rem] font-medium text-slate-500">Delivery instructions</p>
                      <p className="mt-2 text-xs opacity-70">{order.delivery_instructions}</p>
                    </div>
                  ) : null}
                  {order?.delivery_notes_snapshot ? (
                    <div className="text-right">
                      <p className="text-[0.65rem] font-medium text-slate-500">Delivery notes</p>
                      <p className="mt-2 text-xs opacity-70">{order.delivery_notes_snapshot}</p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs opacity-70 mb-3">
                  Pickup time: {order.pickup_time || "ASAP"}
                </p>
              )}
              {order?.fulfillment_type === "delivery" ? (
                <p className="text-xs text-slate-500">{fulfillmentSummary}</p>
              ) : null}
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
                <thead className="text-[11px] font-medium text-slate-500 leading-none">
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
            {order?.status === "pending_payment" ? (
              <p className="text-xs opacity-70">
                Your order will move forward after Stripe confirms payment.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
