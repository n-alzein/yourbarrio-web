export const ORDER_FLOW = [
  "requested",
  "confirmed",
  "ready",
  "out_for_delivery",
  "fulfilled",
];

export const TERMINAL = new Set(["fulfilled"]);

export const ORDER_STATUSES = [...ORDER_FLOW, "cancelled"];

const REOPEN_TARGETS = ["requested", "confirmed"];

const isDelivery = (fulfillmentType) => fulfillmentType === "delivery";

export function isBackward(from, to) {
  const fromIndex = ORDER_FLOW.indexOf(from);
  const toIndex = ORDER_FLOW.indexOf(to);
  if (fromIndex < 0 || toIndex < 0) return false;
  return toIndex < fromIndex;
}

export function canTransition({ from, to, fulfillmentType }) {
  if (!from || !to || from === to) return false;

  if (TERMINAL.has(from)) return false;

  if (to === "cancelled") {
    return from === "requested" || from === "confirmed";
  }

  if (from === "cancelled") {
    return REOPEN_TARGETS.includes(to);
  }

  if (!ORDER_FLOW.includes(from) || !ORDER_FLOW.includes(to)) {
    return false;
  }

  if (!isDelivery(fulfillmentType)) {
    if (from === "out_for_delivery" || to === "out_for_delivery") {
      return false;
    }
  }

  return true;
}

export function allowedTargets({ from, fulfillmentType }) {
  return ORDER_STATUSES.filter((to) =>
    canTransition({ from, to, fulfillmentType })
  );
}
