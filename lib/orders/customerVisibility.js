export const CUSTOMER_ACTIVE_ORDER_STATUSES = [
  "requested",
  "confirmed",
  "ready",
  "out_for_delivery",
];

export const CUSTOMER_HISTORY_ORDER_STATUSES = [
  "fulfilled",
  "completed",
  "cancelled",
];

export const CUSTOMER_VISIBLE_ORDER_STATUSES = [
  ...CUSTOMER_ACTIVE_ORDER_STATUSES,
  ...CUSTOMER_HISTORY_ORDER_STATUSES,
];

export function isCustomerVisiblePaidOrder(order) {
  return (
    Boolean(order?.paid_at) &&
    CUSTOMER_VISIBLE_ORDER_STATUSES.includes(order?.status)
  );
}
