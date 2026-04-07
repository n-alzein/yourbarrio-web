export const ORDER_STATUS_LABELS = {
  pending_payment: "Pending payment",
  payment_failed: "Payment failed",
  requested: "Requested",
  confirmed: "Confirmed",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
  completed: "Completed",
};

export const ORDER_STATUS_DESCRIPTIONS = {
  pending_payment: "Complete Stripe Checkout to place the order.",
  payment_failed: "Payment did not complete. Try checkout again.",
  requested: "We received the order request.",
  confirmed: "The vendor confirmed the order.",
  ready: "Your order is ready for pickup.",
  out_for_delivery: "Your order is on the way.",
  fulfilled: "Order completed.",
  cancelled: "Order cancelled.",
  completed: "Order completed.",
};

export const formatMoney = (value) =>
  Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const formatOrderDateTime = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export const getOrderStatusLabel = (status) =>
  ORDER_STATUS_LABELS[status] || status || "Unknown";

export const getOrderStatusDescription = (status) =>
  ORDER_STATUS_DESCRIPTIONS[status] || "Order in progress.";
