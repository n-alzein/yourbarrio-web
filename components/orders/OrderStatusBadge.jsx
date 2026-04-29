"use client";

import { getOrderStatusLabel } from "@/lib/orders";

export default function OrderStatusBadge({
  status,
  label,
  className = "",
  minimal = false,
}) {
  const text = label || getOrderStatusLabel(status);
  return (
    <span
      className={`status-badge inline-flex items-center rounded-full ${
        minimal
          ? "border-transparent px-2.5 py-1 text-[11px] font-semibold tracking-[0.01em]"
          : "px-3 py-1 text-xs font-semibold"
      } ${className}`}
      data-status={status}
    >
      {text}
    </span>
  );
}
