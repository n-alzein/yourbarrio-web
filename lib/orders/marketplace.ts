import "server-only";

export const STRIPE_PENDING_ORDER_STATUS = "pending_payment";
export const STRIPE_FAILED_ORDER_STATUS = "payment_failed";
export const STRIPE_PAID_ORDER_STATUS = "requested";

export function isStripePendingStatus(status: string | null | undefined) {
  return status === STRIPE_PENDING_ORDER_STATUS;
}

export function isStripeFailureStatus(status: string | null | undefined) {
  return status === STRIPE_FAILED_ORDER_STATUS;
}

export function resolvePaidOrderStatus(status: string | null | undefined) {
  if (!status) return STRIPE_PAID_ORDER_STATUS;
  if (status === STRIPE_PENDING_ORDER_STATUS || status === STRIPE_FAILED_ORDER_STATUS) {
    return STRIPE_PAID_ORDER_STATUS;
  }
  return status;
}

export function resolvePaymentFailedStatus(status: string | null | undefined) {
  if (!status) return STRIPE_FAILED_ORDER_STATUS;
  if (status === STRIPE_PENDING_ORDER_STATUS || status === STRIPE_FAILED_ORDER_STATUS) {
    return STRIPE_FAILED_ORDER_STATUS;
  }
  return status;
}

export function shouldWritePaidTimestamp(status: string | null | undefined) {
  return status === STRIPE_PENDING_ORDER_STATUS || status === STRIPE_FAILED_ORDER_STATUS;
}
