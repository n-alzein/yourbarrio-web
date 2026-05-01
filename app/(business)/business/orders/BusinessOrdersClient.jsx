"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import OrderStatusBadge from "@/components/orders/OrderStatusBadge";
import {
  formatMoney,
  formatOrderDateTime,
  getOrderStatusDescription,
  getOrderStatusLabel,
} from "@/lib/orders";
import { entityIdsMatch, formatEntityId } from "@/lib/entityIds";
import {
  allowedTargets,
  canTransition,
  isBackward,
} from "@/lib/orders/statusTransitions";
import { getOrderItemThumbnailUrl } from "@/lib/orders/itemThumbnails";

const TABS = [
  { id: "new", label: "New" },
  { id: "progress", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

const DATE_RANGES = [
  { id: "all", label: "All time" },
  { id: "7", label: "Last 7 days" },
  { id: "30", label: "Last 30 days" },
];

const baseButton =
  "inline-flex items-center justify-center rounded-full px-4 h-9 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 focus-visible:ring-offset-2";

const fieldBase =
  "w-full rounded-full border px-4 h-11 text-sm bg-transparent transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 focus-visible:ring-offset-2";

const getLocalRangeStart = (days) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start.getTime();
};

const toNumberOrZero = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const centsToDollars = (value) => Math.max(0, toNumberOrZero(value) / 100);

const getOrderItems = (order) =>
  Array.isArray(order?.order_items) ? order.order_items : [];

const getOrderDisplayId = (orderNumber) =>
  formatEntityId("order", orderNumber) || orderNumber || "";

const getOrderPreviewThumbnailUrl = (order) =>
  getOrderItemThumbnailUrl(getOrderItems(order)[0]);

function OrderThumbnail({ order }) {
  const thumbnailUrl = getOrderPreviewThumbnailUrl(order);
  const itemCount = getOrderItems(order).length;

  return (
    <div className="flex shrink-0 items-center gap-2">
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt=""
          loading="lazy"
          className="h-10 w-10 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="h-10 w-10 shrink-0 rounded-lg"
          style={{
            background:
              "linear-gradient(135deg, rgba(15, 23, 42, 0.06), rgba(15, 23, 42, 0.02))",
            border: "1px solid rgba(15, 23, 42, 0.06)",
          }}
        />
      )}
      {itemCount > 1 ? (
        <span className="whitespace-nowrap text-[11px] font-medium opacity-60">
          {itemCount} items
        </span>
      ) : null}
    </div>
  );
}

function ItemThumbnail({ item }) {
  const thumbnailUrl = getOrderItemThumbnailUrl(item);

  if (!thumbnailUrl) {
    return (
      <div
        aria-hidden="true"
        className="h-9 w-9 shrink-0 rounded-lg"
        style={{
          background:
            "linear-gradient(135deg, rgba(15, 23, 42, 0.06), rgba(15, 23, 42, 0.02))",
          border: "1px solid rgba(15, 23, 42, 0.06)",
        }}
      />
    );
  }

  return (
    <img
      src={thumbnailUrl}
      alt=""
      loading="lazy"
      className="h-9 w-9 shrink-0 rounded-lg object-cover"
    />
  );
}

export default function BusinessOrdersClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialTab = searchParams?.get("tab") || "new";
  const orderParam = searchParams?.get("order") || "";
  const [activeTab, setActiveTab] = useState(
    TABS.some((tab) => tab.id === initialTab) ? initialTab : "new"
  );
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const [statusMenuOrder, setStatusMenuOrder] = useState(null);
  const [dismissedOrderParam, setDismissedOrderParam] = useState("");
  const [acknowledgedOrderIds, setAcknowledgedOrderIds] = useState(() => new Set());
  const deliveryInstructions = selectedOrder?.delivery_instructions?.trim();
  const deliveryNotesSnapshot = selectedOrder?.delivery_notes_snapshot?.trim();
  const subtotalAmount = Math.max(0, toNumberOrZero(selectedOrder?.subtotal));
  const deliveryFeeAmount = centsToDollars(selectedOrder?.delivery_fee_cents_snapshot);
  const taxAmount = Math.max(
    0,
    toNumberOrZero(
      selectedOrder?.tax ??
        selectedOrder?.tax_amount ??
        selectedOrder?.tax_total ??
        selectedOrder?.tax_snapshot
    )
  );
  const derivedPlatformFeeAmount = Math.max(
    0,
    toNumberOrZero(selectedOrder?.total) - subtotalAmount - deliveryFeeAmount - taxAmount
  );
  const platformFeeAmount = Math.max(
    0,
    selectedOrder?.platform_fee_cents != null
      ? centsToDollars(selectedOrder.platform_fee_cents)
      : selectedOrder?.platform_fee_amount != null
        ? centsToDollars(selectedOrder.platform_fee_amount)
        : derivedPlatformFeeAmount
  );
  const totalAmount = Math.max(0, toNumberOrZero(selectedOrder?.total));

  const getConfirmMessage = (fromStatus, toStatus, orderNumber) => {
    const orderLabel = orderNumber ? `Order ${orderNumber}` : "this order";
    if (fromStatus === "cancelled") {
      return `Reopen ${orderLabel} to ${getOrderStatusLabel(toStatus)}?`;
    }
    const fromLabel = getOrderStatusLabel(fromStatus);
    const toLabel = getOrderStatusLabel(toStatus);
    const direction = isBackward(fromStatus, toStatus) ? "back to" : "to";
    return `Change ${orderLabel} from ${fromLabel} ${direction} ${toLabel}?`;
  };

  const loadOrders = async (tabId) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/business/orders?tab=${tabId}`, {
        credentials: "include",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load orders");
      }
      setOrders(payload?.orders || []);
    } catch (err) {
      setError(err?.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedOrder(null);
    loadOrders(activeTab);
  }, [activeTab]);

  useEffect(() => {
    setSelectedOrder(null);
  }, [orderParam]);

  useEffect(() => {
    if (dismissedOrderParam && dismissedOrderParam !== orderParam) {
      setDismissedOrderParam("");
    }
  }, [dismissedOrderParam, orderParam]);

  useEffect(() => {
    setStatusMenuOrder(null);
  }, [activeTab, orderParam]);

  useEffect(() => {
    if (!orderParam || orderParam === dismissedOrderParam || selectedOrder?.id) return;
    const matched = orders.find((order) =>
      entityIdsMatch("order", order.order_number, orderParam)
    );
    if (matched) {
      setSelectedOrder(matched);
    }
  }, [dismissedOrderParam, orderParam, orders, selectedOrder?.id]);

  useEffect(() => {
    const orderId = selectedOrder?.id;
    if (!orderId || selectedOrder?.acknowledged_at || acknowledgedOrderIds.has(orderId)) {
      return;
    }

    let cancelled = false;
    setAcknowledgedOrderIds((prev) => {
      const next = new Set(prev);
      next.add(orderId);
      return next;
    });

    (async () => {
      try {
        const response = await fetch("/api/business/orders", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: orderId }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to acknowledge order");
        }
        if (cancelled) return;
        setOrders((prev) =>
          Array.isArray(prev)
            ? prev.map((order) =>
                order.id === orderId ? { ...order, ...payload.order } : order
              )
            : []
        );
        setSelectedOrder((prev) =>
          prev?.id === orderId ? { ...prev, ...payload.order } : prev
        );
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || "Failed to acknowledge order");
        setAcknowledgedOrderIds((prev) => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [acknowledgedOrderIds, selectedOrder]);

  const getPrimaryAction = (order) => {
    if (!order) return null;
    if (order.status === "requested") {
      return { label: "Confirm", status: "confirmed" };
    }
    if (order.status === "confirmed") {
      return { label: "Mark ready", status: "ready" };
    }
    if (order.status === "ready") {
      if (order.fulfillment_type === "delivery") {
        return { label: "Out for delivery", status: "out_for_delivery" };
      }
      return { label: "Mark fulfilled", status: "fulfilled" };
    }
    if (order.status === "out_for_delivery") {
      return { label: "Mark fulfilled", status: "fulfilled" };
    }
    return null;
  };

  const getChangeTargets = (order) =>
    allowedTargets({
      from: order?.status,
      fulfillmentType: order?.fulfillment_type,
    });

  const getOrderActions = (order) => {
    if (!order) return { primaryAction: null, hasMenu: false };
    return {
      primaryAction: getPrimaryAction(order),
      hasMenu: getChangeTargets(order).length > 0,
    };
  };

  const filteredOrders = useMemo(() => {
    let next = [...orders];
    const term = searchTerm.trim().toLowerCase();
    if (term) {
      next = next.filter((order) => {
        const haystack = [
          order.order_number,
          getOrderDisplayId(order.order_number),
          order.contact_name,
          order.contact_phone,
          order.contact_email,
          order.total,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      });
    }
    if (dateRange !== "all") {
      const days = Number(dateRange);
      const cutoff = getLocalRangeStart(days);
      next = next.filter((order) => {
        const createdAt = Date.parse(order.created_at);
        if (Number.isNaN(createdAt)) return true;
        return createdAt >= cutoff;
      });
    }
    return next;
  }, [orders, searchTerm, dateRange]);

  const orderActions = getOrderActions(selectedOrder);
  const statusMenuTargets = statusMenuOrder
    ? getChangeTargets(statusMenuOrder)
    : [];

  const getStatusMenuLabel = (fromStatus, toStatus) => {
    if (toStatus === "cancelled") return "Cancel order";
    if (fromStatus === "cancelled") {
      return `Reopen (${getOrderStatusLabel(toStatus)})`;
    }
    if (isBackward(fromStatus, toStatus)) {
      return `Move back to ${getOrderStatusLabel(toStatus)}`;
    }
    return `Move to ${getOrderStatusLabel(toStatus)}`;
  };

  const handleStatusUpdate = async (orderId, nextStatus, options = {}) => {
    const currentOrder =
      (selectedOrder?.id === orderId ? selectedOrder : null) ||
      orders.find((order) => order.id === orderId);
    const currentStatus = options.fromStatus || currentOrder?.status;
    const isBackwardMove =
      currentStatus && isBackward(currentStatus, nextStatus);
    const isReopen = currentStatus === "cancelled";
    const shouldConfirm =
      options.confirm !== false &&
      currentStatus &&
      (isBackwardMove || isReopen);
    const needsReason = isBackwardMove || isReopen;

    const transitionAllowed = canTransition({
      from: currentStatus,
      to: nextStatus,
      fulfillmentType: currentOrder?.fulfillment_type,
    });
    if (!transitionAllowed) {
      setError("Invalid status transition");
      return false;
    }

    if (shouldConfirm) {
      const confirmed = window.confirm(
        getConfirmMessage(currentStatus, nextStatus, currentOrder?.order_number)
      );
      if (!confirmed) return false;
    }

    let reason = (options.reason || "").trim();
    if (needsReason && reason.length < 5) {
      const prompted = window.prompt(
        "Why are you changing this status? (required, min 5 characters)"
      );
      reason = (prompted || "").trim();
      if (reason.length < 5) {
        setError("Reason required");
        return false;
      }
    }

    setUpdatingId(orderId);
    try {
      const response = await fetch("/api/business/orders", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          status: nextStatus,
          reason: reason || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to update order");
      }
      setOrders((prev) =>
        Array.isArray(prev)
          ? prev.map((order) =>
              order.id === orderId ? { ...order, ...payload.order } : order
            )
          : []
      );
      setSelectedOrder((prev) => {
        if (!prev || prev.id !== orderId) return prev;
        return { ...prev, ...payload.order };
      });
      setStatusMenuOrder((prev) => {
        if (!prev || prev.id !== orderId) return prev;
        return { ...prev, ...payload.order };
      });
      return true;
    } catch (err) {
      setError(err?.message || "Failed to update order");
      return false;
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStatusMenuSelect = async (targetStatus) => {
    if (!statusMenuOrder) return;
    const changed = await handleStatusUpdate(
      statusMenuOrder.id,
      targetStatus,
      { fromStatus: statusMenuOrder.status }
    );
    if (changed !== false) {
      setStatusMenuOrder(null);
    }
  };

  const isFiltered = searchTerm.trim() || dateRange !== "all";
  const emptyTitle =
    orders.length === 0
      ? "No orders in this view"
      : "No orders match those filters";
  const emptyBody =
    orders.length === 0
      ? "New orders will show up here when customers submit requests."
      : "Try clearing filters or searching with a different keyword.";

  const closeSelectedOrder = useCallback(() => {
    if (orderParam) {
      setDismissedOrderParam(orderParam);
    }

    setSelectedOrder(null);

    if (!orderParam) return;

    const nextParams = new URLSearchParams(searchParams?.toString() || "");
    nextParams.delete("order");
    const nextQuery = nextParams.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;

    router.replace(nextUrl, { scroll: false });
  }, [orderParam, pathname, router, searchParams]);

  const openOrderDetails = (order) => {
    if (!order?.order_number) return;

    setDismissedOrderParam("");
    setSelectedOrder(order);

    const nextParams = new URLSearchParams(searchParams?.toString() || "");
    nextParams.set("tab", activeTab);
    nextParams.set("order", order.order_number);
    const nextQuery = nextParams.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;

    router.replace(nextUrl, { scroll: false });
  };

  const handleOrderActivationKeyDown = (event, order) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openOrderDetails(order);
  };

  useEffect(() => {
    if (!selectedOrder) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeSelectedOrder();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeSelectedOrder, selectedOrder]);

  return (
    <div
      className="min-h-screen px-4 pb-12 md:px-8 lg:px-12"
      style={{
        background: "var(--background)",
        color: "var(--text)",
        paddingTop: "calc(var(--yb-nav-content-offset, 0px) + 16px)",
      }}
    >
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] opacity-70">
            Orders
          </p>
          <h1 className="text-3xl font-semibold">Manage orders</h1>
          <p className="text-sm opacity-70 mb-4">
            Track requests, update fulfillment, and keep customers informed.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="rounded-full px-4 h-10 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 focus-visible:ring-offset-2"
              style={
                activeTab === tab.id
                  ? { background: "var(--text)", color: "var(--background)" }
                  : { border: "1px solid var(--border)" }
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60" />
            <input
              type="search"
              placeholder="Search by order number, customer, or phone"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className={`${fieldBase} pl-11 pr-10`}
              style={{ borderColor: "var(--border)" }}
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 focus-visible:ring-offset-2"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="order-date-range" className="sr-only">
              Date range
            </label>
            <select
              id="order-date-range"
              value={dateRange}
              onChange={(event) => setDateRange(event.target.value)}
              className={fieldBase}
              style={{ borderColor: "var(--border)" }}
            >
              {DATE_RANGES.map((range) => (
                <option key={range.id} value={range.id}>
                  {range.label}
                </option>
              ))}
            </select>
          </div>
          <div className="text-xs opacity-70">
            {filteredOrders.length}{" "}
            {filteredOrders.length === 1 ? "order" : "orders"}
          </div>
        </div>

        {error ? (
          <div
            className="rounded-2xl p-4 text-sm text-rose-600 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => loadOrders(activeTab)}
              className={`${baseButton} border`}
              style={{ borderColor: "var(--border)" }}
            >
              Retry
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-5">
            <div className="md:hidden space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`skeleton-card-${index}`}
                  className="rounded-3xl p-5 animate-pulse"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                  <div className="h-4 w-32 rounded bg-black/10 mb-3" />
                  <div className="h-3 w-48 rounded bg-black/10 mb-2" />
                  <div className="h-3 w-36 rounded bg-black/10 mb-4" />
                  <div className="h-8 w-full rounded-full bg-black/10" />
                </div>
              ))}
            </div>
            <div
              className="hidden md:block rounded-3xl overflow-hidden"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div className="max-h-[520px] overflow-auto">
                <table className="min-w-full text-sm border-separate [border-spacing:0_8px]">
                  <thead
                    className="sticky top-0 z-10 text-[10px] uppercase tracking-[0.2em] opacity-70"
                    style={{
                      background: "var(--surface)",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <tr>
                      {["Order", "Customer", "Fulfillment", "Schedule", "Status", "Total", ""].map(
                        (label) => (
                          <th key={label} className="py-3 px-4 text-left font-semibold">
                            {label}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 6 }).map((_, index) => (
                      <tr key={`skeleton-row-${index}`}>
                        {Array.from({ length: 7 }).map((__, cell) => (
                          <td key={`cell-${cell}`} className="py-4 px-4">
                            <div className="h-3 w-full rounded bg-black/10" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div
            className="rounded-3xl p-8 text-center"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <h2 className="text-xl font-semibold">{emptyTitle}</h2>
            <p className="mt-2 text-sm opacity-80">{emptyBody}</p>
            {isFiltered ? (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setDateRange("all");
                }}
                className={`${baseButton} mt-5 border`}
                style={{ borderColor: "var(--border)" }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-5">
            <div
              className="hidden md:block rounded-3xl overflow-hidden"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div className="max-h-[520px] overflow-auto">
                <table className="min-w-full text-sm border-separate [border-spacing:0_8px]">
                  <thead
                    className="sticky top-0 z-10 text-[10px] uppercase tracking-[0.2em] opacity-70"
                    style={{
                      background: "var(--surface)",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <tr>
                      <th className="py-3 px-4 text-left font-semibold">Order</th>
                      <th className="py-3 px-4 text-left font-semibold">Customer</th>
                      <th className="py-3 px-4 text-left font-semibold">
                        Fulfillment
                      </th>
                      <th className="py-3 px-4 text-left font-semibold">Schedule</th>
                      <th className="py-3 px-4 text-left font-semibold">Status</th>
                      <th className="py-3 px-4 text-right font-semibold">Total</th>
                      <th className="py-3 px-4 text-right font-semibold">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => {
                      const schedule =
                        order.fulfillment_type === "delivery"
                          ? order.delivery_time
                          : order.pickup_time;
                      const { primaryAction, hasMenu } = getOrderActions(order);
                      return (
                        <tr
                          key={order.id}
                          className="cursor-pointer transition hover:bg-[var(--overlay)] focus-within:bg-[var(--overlay)]"
                          tabIndex={0}
                          role="button"
                          aria-label={`Open order ${getOrderDisplayId(order.order_number)}`}
                          onClick={() => openOrderDetails(order)}
                          onKeyDown={(event) => handleOrderActivationKeyDown(event, order)}
                        >
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-3">
                              <OrderThumbnail order={order} />
                              <div className="min-w-0 space-y-1">
                                <p className="font-semibold">
                                  Order {getOrderDisplayId(order.order_number)}
                                </p>
                                <p className="text-xs opacity-70">
                                  {formatOrderDateTime(order.created_at)}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="space-y-1">
                              <p className="font-semibold">
                                {order.contact_name || "Customer"}
                              </p>
                              <p className="text-xs opacity-70">
                                {order.contact_phone || order.contact_email || "—"}
                              </p>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="text-xs uppercase tracking-[0.12em] opacity-70">
                              {order.fulfillment_type === "delivery"
                                ? "Delivery"
                                : "Pickup"}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <span className="text-xs opacity-70">
                              {schedule || "ASAP"}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <OrderStatusBadge status={order.status} />
                          </td>
                          <td className="py-4 px-4 text-right font-semibold">
                            ${formatMoney(order.total)}
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openOrderDetails(order);
                                }}
                                className={`${baseButton} border`}
                                style={{ borderColor: "var(--border)" }}
                              >
                                View
                              </button>
                              {hasMenu ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setStatusMenuOrder(order);
                                  }}
                                  disabled={updatingId === order.id}
                                  className={`${baseButton} border`}
                                  style={{
                                    borderColor: "var(--border)",
                                    background: "transparent",
                                    color: "var(--text)",
                                    opacity: updatingId === order.id ? 0.7 : 1,
                                  }}
                                >
                                  Change status
                                </button>
                              ) : null}
                              {primaryAction ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleStatusUpdate(order.id, primaryAction.status);
                                  }}
                                  disabled={updatingId === order.id}
                                  className={baseButton}
                                  style={{
                                    background: "var(--text)",
                                    color: "var(--background)",
                                    opacity: updatingId === order.id ? 0.7 : 1,
                                  }}
                                >
                                  {updatingId === order.id
                                    ? "Updating..."
                                    : primaryAction.label}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="md:hidden space-y-5">
              {filteredOrders.map((order) => {
                const schedule =
                  order.fulfillment_type === "delivery"
                    ? order.delivery_time
                    : order.pickup_time;
                const { primaryAction, hasMenu } = getOrderActions(order);
                return (
                  <div
                    key={order.id}
                    className="cursor-pointer rounded-3xl p-5 space-y-5 transition hover:bg-[var(--overlay)] focus-within:bg-[var(--overlay)]"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open order ${getOrderDisplayId(order.order_number)}`}
                    onClick={() => openOrderDetails(order)}
                    onKeyDown={(event) => handleOrderActivationKeyDown(event, order)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <OrderThumbnail order={order} />
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-semibold">
                            Order {getOrderDisplayId(order.order_number)}
                          </p>
                          <p className="text-xs opacity-70">
                            {formatOrderDateTime(order.created_at)}
                          </p>
                        </div>
                      </div>
                      <OrderStatusBadge status={order.status} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="space-y-1">
                        <p className="uppercase tracking-[0.18em] opacity-60">
                          Customer
                        </p>
                        <p className="text-sm font-semibold">
                          {order.contact_name || "Customer"}
                        </p>
                        <p className="opacity-70">
                          {order.contact_phone || order.contact_email || "—"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="uppercase tracking-[0.18em] opacity-60">
                          Fulfillment
                        </p>
                        <p className="text-sm font-semibold">
                          {order.fulfillment_type === "delivery"
                            ? "Delivery"
                            : "Pickup"}
                        </p>
                        <p className="opacity-70">{schedule || "ASAP"}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">
                        ${formatMoney(order.total)}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openOrderDetails(order);
                          }}
                          className={`${baseButton} border`}
                          style={{ borderColor: "var(--border)" }}
                        >
                          View
                        </button>
                        {hasMenu ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setStatusMenuOrder(order);
                            }}
                            disabled={updatingId === order.id}
                            className={`${baseButton} border`}
                            style={{
                              borderColor: "var(--border)",
                              background: "transparent",
                              color: "var(--text)",
                              opacity: updatingId === order.id ? 0.7 : 1,
                            }}
                          >
                            Change status
                          </button>
                        ) : null}
                        {primaryAction ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleStatusUpdate(order.id, primaryAction.status);
                            }}
                            disabled={updatingId === order.id}
                            className={baseButton}
                            style={{
                              background: "var(--text)",
                              color: "var(--background)",
                              opacity: updatingId === order.id ? 0.7 : 1,
                            }}
                          >
                            {updatingId === order.id
                              ? "Updating..."
                              : primaryAction.label}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {selectedOrder ? (
        <div
          className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-detail-title"
          onClick={closeSelectedOrder}
        >
          <div
            className="order-detail-surface w-full max-w-3xl rounded-3xl p-6 max-h-[85vh] overflow-y-auto"
            style={{
              background: "var(--order-detail-bg)",
              border: "1px solid var(--border)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2 w-full max-w-[35%] flex-none">
                <p className="text-xs uppercase tracking-[0.2em] opacity-70">
                  Order details
                </p>
                <h2 id="order-detail-title" className="text-2xl font-semibold">
                  Order {getOrderDisplayId(selectedOrder.order_number)}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <OrderStatusBadge status={selectedOrder.status} />
                  <span className="text-xs opacity-70">
                    {formatOrderDateTime(selectedOrder.created_at)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={closeSelectedOrder}
                className="rounded-full p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 focus-visible:ring-offset-2"
                aria-label="Close order details"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] opacity-60">
                  Customer
                </p>
                <p className="font-semibold">{selectedOrder.contact_name}</p>
                <p className="text-xs opacity-70">
                  {selectedOrder.contact_phone || "No phone listed"}
                </p>
                {selectedOrder.contact_email ? (
                  <p className="text-xs opacity-70">
                    {selectedOrder.contact_email}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] opacity-60">
                  Fulfillment
                </p>
                <p className="font-semibold">
                  {selectedOrder.fulfillment_type === "delivery"
                    ? "Delivery"
                    : "Pickup"}
                </p>
                {selectedOrder.fulfillment_type === "delivery" ? (
                  <p className="text-xs opacity-70">
                    {selectedOrder.delivery_address1}
                    {selectedOrder.delivery_address2
                      ? `, ${selectedOrder.delivery_address2}`
                      : ""}
                  </p>
                ) : (
                  <p className="text-xs opacity-70">
                    Pickup time: {selectedOrder.pickup_time || "ASAP"}
                  </p>
                )}
                {selectedOrder.fulfillment_type === "delivery" &&
                deliveryInstructions ? (
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.2em] opacity-60">
                      Delivery instructions
                    </p>
                    <p className="text-xs opacity-70 whitespace-pre-wrap">
                      {deliveryInstructions}
                    </p>
                  </div>
                ) : null}
                {selectedOrder.fulfillment_type === "delivery" &&
                deliveryNotesSnapshot ? (
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.2em] opacity-60">
                      Delivery notes
                    </p>
                    <p className="text-xs opacity-70 whitespace-pre-wrap">
                      {deliveryNotesSnapshot}
                    </p>
                  </div>
                ) : null}
                <p className="text-xs opacity-70">
                  {getOrderStatusDescription(selectedOrder.status)}
                </p>
              </div>
            </div>

            <div
              className="mt-4 border-t pt-4"
              style={{ borderColor: "var(--border)" }}
            >
              <p className="text-sm font-semibold">Items</p>
              <div className="mt-2 text-xs uppercase tracking-[0.2em] opacity-60 grid grid-cols-[1fr_80px_110px_130px] gap-6">
                <span>Item</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit</span>
                <span className="text-right">Total</span>
              </div>
              <div className="mt-2 space-y-2 text-sm">
                {(selectedOrder.order_items || []).map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_80px_110px_130px] items-center gap-6"
                  >
                    <span className="opacity-80">
                      <span className="flex min-w-0 items-center gap-3">
                        <ItemThumbnail item={item} />
                        <span className="min-w-0">
                          {item.listing_id ? (
                            <Link
                              href={`/listings/${item.listing_id}`}
                              className="hover:underline"
                            >
                              {item.title}
                            </Link>
                          ) : (
                            item.title
                          )}
                        </span>
                      </span>
                    </span>
                    <span className="text-right">{item.quantity}</span>
                    <span className="text-right">
                      ${formatMoney(item.unit_price)}
                    </span>
                    <span className="text-right">
                      $
                      {formatMoney(
                        Number(item.unit_price || 0) * Number(item.quantity || 0)
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="mt-4 border-t pt-4 text-sm"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between">
                <span className="opacity-80">Subtotal</span>
                <span className="text-right">${formatMoney(subtotalAmount)}</span>
              </div>
              {selectedOrder.fulfillment_type === "delivery" ? (
                <div className="mt-2 flex items-center justify-between">
                  <span className="opacity-80">Delivery fee</span>
                  <span className="text-right">${formatMoney(deliveryFeeAmount)}</span>
                </div>
              ) : null}
              <div className="mt-2 flex items-center justify-between">
                <span className="opacity-80">Platform fee</span>
                <span className="text-right">${formatMoney(platformFeeAmount)}</span>
              </div>
              {taxAmount > 0 ? (
                <div className="mt-2 flex items-center justify-between">
                  <span className="opacity-80">Tax</span>
                  <span className="text-right">${formatMoney(taxAmount)}</span>
                </div>
              ) : null}
              <div
                className="mt-2 flex items-center justify-between border-t pt-2 font-medium"
                style={{ borderColor: "var(--border)" }}
              >
                <span>Total</span>
                <span className="text-right">${formatMoney(totalAmount)}</span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <OrderStatusBadge
                status={selectedOrder.status}
                label={getOrderStatusLabel(selectedOrder.status)}
              />
            </div>

            {orderActions.primaryAction || orderActions.hasMenu ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {orderActions.hasMenu ? (
                  <button
                    type="button"
                    onClick={() => setStatusMenuOrder(selectedOrder)}
                    disabled={updatingId === selectedOrder.id}
                    className={`${baseButton} border`}
                    style={{
                      borderColor: "var(--border)",
                      background: "transparent",
                      color: "var(--text)",
                      opacity: updatingId === selectedOrder.id ? 0.7 : 1,
                    }}
                  >
                    Change status
                  </button>
                ) : null}
                {orderActions.primaryAction ? (
                  <button
                    type="button"
                    onClick={() =>
                      handleStatusUpdate(
                        selectedOrder.id,
                        orderActions.primaryAction.status
                      )
                    }
                    disabled={updatingId === selectedOrder.id}
                    className={baseButton}
                    style={{
                      background: "var(--text)",
                      color: "var(--background)",
                      opacity: updatingId === selectedOrder.id ? 0.7 : 1,
                    }}
                  >
                    {updatingId === selectedOrder.id
                      ? "Updating..."
                      : orderActions.primaryAction.label}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {statusMenuOrder ? (
        <div
          className="fixed inset-0 z-[6100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-status-title"
        >
          <div
            className="w-full max-w-lg rounded-3xl p-6 space-y-4"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.2em] opacity-70">
                  Status management
                </p>
                <h3 id="change-status-title" className="text-xl font-semibold">
                  Change status
                </h3>
                <p className="text-xs opacity-70">
                  Order {getOrderDisplayId(statusMenuOrder.order_number)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStatusMenuOrder(null)}
                className="rounded-full p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 focus-visible:ring-offset-2"
                aria-label="Close change status"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {statusMenuTargets.map((target) => {
                const destructive = target === "cancelled";
                return (
                  <button
                    key={target}
                    type="button"
                    onClick={() => handleStatusMenuSelect(target)}
                    disabled={updatingId === statusMenuOrder.id}
                    className={`${baseButton} border justify-start text-left`}
                    style={{
                      borderColor: destructive ? "#e11d48" : "var(--border)",
                      color: destructive ? "#e11d48" : "var(--text)",
                      background: "transparent",
                      opacity: updatingId === statusMenuOrder.id ? 0.7 : 1,
                    }}
                  >
                    {getStatusMenuLabel(statusMenuOrder.status, target)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
