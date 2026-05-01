"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ShoppingBag, Trash2, Truck, Minus, Plus } from "lucide-react";
import SafeImage from "@/components/SafeImage";
import { useAuth } from "@/components/AuthProvider";
import { useCart } from "@/components/cart/CartProvider";
import { useModal } from "@/components/modals/ModalProvider";
import { useCurrentAccountContext } from "@/lib/auth/useCurrentAccountContext";
import { setAuthIntent } from "@/lib/auth/authIntent";
import { DELIVERY_FULFILLMENT_TYPE, PICKUP_FULFILLMENT_TYPE } from "@/lib/fulfillment";
import {
  getPurchaseRestrictionHelpText,
  getPurchaseRestrictionMessage,
} from "@/lib/auth/purchaseAccess";
import { calculateCheckoutPricing } from "@/lib/pricing";

const formatMoney = (value) => {
  const amount = Number(value || 0);
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const LISTING_DETAIL_CART_VALIDATION_ERRORS = new Set([
  "Select a product option before adding this item to your cart.",
  "Select a valid product option before adding this item to your cart.",
  "Select each product option before adding this item to your cart.",
]);

function EmptyCartDiscoveryState() {
  return (
    <div
      className="px-4 pb-6 pt-6 md:px-8 md:pb-8 md:pt-8 lg:px-12"
      style={{ background: "var(--background)", color: "var(--text)" }}
    >
      <div className="mx-auto max-w-5xl">
        <div className="flex min-h-[calc(100vh-20rem)] items-start justify-center pt-2 md:pt-3">
          <section
            className="w-full max-w-[640px] rounded-[32px] px-6 py-7 text-center md:px-8 md:py-8"
            style={{
              background: "rgba(255,255,255,0.92)",
              boxShadow: "0 20px 44px -38px rgba(15,23,42,0.16)",
            }}
          >
            <div className="mx-auto max-w-[460px]">
              <h1 className="text-[1.78rem] font-semibold tracking-[-0.04em] text-slate-950 md:text-[2.1rem]">
                Your cart is empty
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-500 md:text-[15px]">
                Add an item from a local listing to start an order.
              </p>
              <div className="mt-4 flex flex-col items-center gap-2">
                <Link
                  href="/listings"
                  className="yb-cart-empty-cta inline-flex min-h-10 items-center justify-center rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition focus-visible:ring-offset-2"
                >
                  Browse local listings
                </Link>
                <Link
                  href="/customer/nearby"
                  className="text-[13px] font-medium text-slate-400 transition hover:text-violet-700 hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
                >
                  Explore nearby shops
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function CartPageClient() {
  const { user } = useAuth();
  const { openModal } = useModal();
  const accountContext = useCurrentAccountContext();
  const { items, vendorGroups, loading, error, updateItem, removeItem, setFulfillmentType } = useCart();
  const [updatingItem, setUpdatingItem] = useState(null);
  const [fulfillmentErrors, setFulfillmentErrors] = useState({});
  const purchaseRestricted = accountContext.purchaseRestricted;
  const purchaseEligibilityPending = accountContext.rolePending;
  const visibleCartError = LISTING_DETAIL_CART_VALIDATION_ERRORS.has(String(error || "").trim())
    ? null
    : error;

  const allItemsSubtotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0), 0),
    [items]
  );
  const fees = useMemo(
    () =>
      vendorGroups.reduce(
        (sum, group) =>
          sum +
          calculateCheckoutPricing({
            subtotalCents: Math.round(Number(group.subtotal || 0) * 100),
          }).platformFeeCents /
            100,
        0
      ),
    [vendorGroups]
  );
  const deliveryFees = useMemo(
    () =>
      vendorGroups.reduce((sum, group) => {
        if (group.fulfillment_type !== DELIVERY_FULFILLMENT_TYPE) return sum;
        return sum + Number(group.delivery_fee_cents || 0) / 100;
      }, 0),
    [vendorGroups]
  );
  const total = allItemsSubtotal + deliveryFees + fees;

  const handleQuantityChange = async (item, delta) => {
    const maxQuantity = Number(item.max_order_quantity || 0);
    const nextQuantity = Math.min(Number(item.quantity || 0) + delta, maxQuantity || 0);
    setUpdatingItem(item.id);
    if (nextQuantity <= 0) {
      await removeItem(item.id);
    } else {
      await updateItem({ itemId: item.id, quantity: nextQuantity });
    }
    setUpdatingItem(null);
  };

  const handleFulfillmentChange = async (group, mode) => {
    const groupKey = group.business_id || "unknown";
    setFulfillmentErrors((prev) => ({ ...prev, [groupKey]: null }));
    const result = await setFulfillmentType(mode, {
      cartId: group.cart_id,
      businessId: group.business_id,
    });
    if (result?.error) {
      setFulfillmentErrors((prev) => ({ ...prev, [groupKey]: result.error }));
    }
  };

  const handleGuestCheckout = (checkoutHref) => {
    const next = checkoutHref || "/cart";
    setAuthIntent({ redirectTo: next, role: "customer" });
    openModal("customer-login", { next });
  };

  if (loading) {
    return (
      <div className="min-h-screen px-4 md:px-8 lg:px-12 py-12" style={{ background: "var(--background)", color: "var(--text)" }}>
        <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
          <div className="h-6 w-40 rounded-full" style={{ background: "var(--surface)" }} />
          <div className="h-64 rounded-3xl" style={{ background: "var(--surface)" }} />
        </div>
      </div>
    );
  }

  if (purchaseEligibilityPending) {
    return (
      <div className="min-h-screen px-4 md:px-8 lg:px-12 py-12" style={{ background: "var(--background)", color: "var(--text)" }}>
        <div className="max-w-4xl mx-auto rounded-3xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h1 className="text-2xl font-semibold">Checking account...</h1>
          <p className="mt-3 text-sm opacity-80">We’re confirming your account before enabling checkout.</p>
        </div>
      </div>
    );
  }

  if (purchaseRestricted) {
    return (
      <div className="min-h-screen px-4 md:px-8 lg:px-12 py-12" style={{ background: "var(--background)", color: "var(--text)" }}>
        <div className="max-w-4xl mx-auto rounded-3xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h1 className="text-2xl font-semibold">{getPurchaseRestrictionMessage()}</h1>
          <p className="mt-3 text-sm opacity-80">{getPurchaseRestrictionHelpText()}</p>
          <Link
            href="/customer/home"
            className="mt-6 inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold"
            style={{ background: "var(--text)", color: "var(--background)" }}
          >
            Browse listings
          </Link>
        </div>
      </div>
    );
  }

  if (vendorGroups.length === 0) {
    return <EmptyCartDiscoveryState />;
  }

  return (
    <div className="min-h-screen px-4 pb-10 pt-0 md:px-8 md:pb-14 lg:px-12" style={{ background: "var(--background)", color: "var(--text)" }}>
      <div className="mx-auto max-w-6xl space-y-2">
        <div className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-[0.2em] opacity-70">Cart</p>
          <h1 className="text-3xl font-semibold">Review your cart</h1>
          <p className="text-sm opacity-75">Checkout separately with each business.</p>
          {visibleCartError ? (
            <p className="text-sm text-rose-300">{visibleCartError}</p>
          ) : null}
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-7 md:space-y-8">
            {vendorGroups.map((group) => {
              const businessName = group.business_name || "Local vendor";
              const groupKey = group.business_id || "unknown";
              const hasStockIssues = group.items.some(
                (item) => item.stock_error || Number(item.quantity || 0) > Number(item.max_order_quantity || 0)
              );
              const deliveryAvailable = group.available_fulfillment_methods?.includes(
                DELIVERY_FULFILLMENT_TYPE
              );
              const pickupAvailable = group.available_fulfillment_methods?.includes(
                PICKUP_FULFILLMENT_TYPE
              );
              const pickupOnly = pickupAvailable && !deliveryAvailable;
              const checkoutHref = group.business_id
                ? `/checkout?business_id=${encodeURIComponent(group.business_id)}`
                : "/checkout";

              const checkoutButtonClassName = `inline-flex h-[37px] items-center justify-center rounded-[6px] px-2.5 text-sm font-semibold transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200/30 ${
                hasStockIssues
                  ? "cursor-not-allowed opacity-50"
                  : "hover:-translate-y-0.5"
              }`;

              return (
                <section
                  key={groupKey}
                  className="space-y-1.5 rounded-[20px] px-4 py-3 md:px-4 md:py-3.5"
                  style={{
                    background: "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(252,249,255,0.98))",
                    border: "1px solid rgba(15,23,42,0.05)",
                    boxShadow: "0 8px 22px -24px rgba(76,29,149,0.06)",
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0">
                      <p className="text-base font-semibold">{businessName}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="opacity-75">
                          {group.item_count} {group.item_count === 1 ? "item" : "items"}
                        </span>
                      </div>
                      {pickupOnly ? (
                        <div className="flex items-center gap-1.5 pt-1 text-xs opacity-68">
                          <ShoppingBag className="h-3.5 w-3.5 text-[var(--yb-focus)]" />
                          <span>Pickup only</span>
                          <span aria-hidden="true">·</span>
                          <span>Local delivery unavailable</span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {!pickupOnly ? (
                      <div className="grid grid-cols-2 gap-2">
                        {deliveryAvailable ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleFulfillmentChange(group, DELIVERY_FULFILLMENT_TYPE)
                            }
                            className={`rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                              group.fulfillment_type === DELIVERY_FULFILLMENT_TYPE
                                ? "ring-2 ring-indigo-500/40"
                                : ""
                            }`}
                            style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                          >
                            <span className="flex items-center justify-center gap-2">
                              <Truck className="h-4 w-4" /> Delivery
                            </span>
                          </button>
                        ) : null}
                        {pickupAvailable ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleFulfillmentChange(group, PICKUP_FULFILLMENT_TYPE)
                            }
                            className={`rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                              group.fulfillment_type === PICKUP_FULFILLMENT_TYPE
                                ? "ring-2 ring-indigo-500/40"
                                : ""
                            }`}
                            style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                          >
                            <span className="flex items-center justify-center gap-2">
                              <ShoppingBag className="h-4 w-4" /> Pickup
                            </span>
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {deliveryAvailable ? (
                      <p className="text-xs opacity-75">
                        Delivery fee: ${formatMoney((group.delivery_fee_cents || 0) / 100)}
                      </p>
                    ) : null}
                    {group.delivery_unavailable_reason && !pickupOnly ? (
                      <p className="text-xs opacity-75">
                        {group.delivery_unavailable_reason}
                      </p>
                    ) : null}
                    {fulfillmentErrors[groupKey] ? (
                      <p className="text-xs text-rose-200">{fulfillmentErrors[groupKey]}</p>
                    ) : null}
                  </div>

                  <div
                    className="overflow-hidden rounded-2xl"
                    style={{ borderTop: "1px solid rgba(15,23,42,0.06)" }}
                  >
                    {group.items.map((item) => {
                      const maxQuantity = Number(item.max_order_quantity || 0);
                      const isAtMax = Number(item.quantity || 0) >= maxQuantity;
                      return (
                        <div
                          key={item.id}
                          className="py-2 first:pt-2.5 last:pb-0.5"
                          style={{
                            borderBottom:
                              group.items[group.items.length - 1]?.id === item.id
                                ? "none"
                                : "1px solid rgba(15,23,42,0.045)",
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <SafeImage
                              src={item.image_url || "/business-placeholder.png"}
                              alt={item.title}
                              width={96}
                              height={96}
                              className="h-[72px] w-[72px] shrink-0 rounded-2xl bg-[rgba(15,23,42,0.03)] object-contain object-center md:h-20 md:w-20"
                              useNextImage
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold">{item.title}</p>
                                  {item.variant_label ? (
                                    <p className="mt-1 text-xs opacity-65">{item.variant_label}</p>
                                  ) : null}
                                  <p className="mt-1 text-xs opacity-70">${formatMoney(item.unit_price)}</p>
                                  {item.reservation_expires_at ? (
                                    <p className="mt-1 text-xs opacity-70">
                                      Reserved in your cart for 30 minutes.
                                    </p>
                                  ) : null}
                                  {item.stock_error ? (
                                    <p className="mt-1 text-xs text-rose-200">{item.stock_error}</p>
                                  ) : maxQuantity > 0 && maxQuantity < 5 ? (
                                    <p className="mt-1 text-xs opacity-70">Only {maxQuantity} left available.</p>
                                  ) : null}
                                </div>
                                <div className="flex items-center justify-between gap-2 sm:min-w-[148px] sm:justify-end">
                                  <div
                                    className="flex items-center gap-2 rounded-full px-2 py-1"
                                    style={{ background: "rgba(15,23,42,0.04)", border: "1px solid rgba(15,23,42,0.08)" }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => handleQuantityChange(item, -1)}
                                      disabled={updatingItem === item.id}
                                      className="rounded-full p-1.5"
                                      aria-label="Decrease quantity"
                                    >
                                      <Minus className="h-4 w-4" />
                                    </button>
                                    <span className="min-w-[24px] text-center text-sm font-semibold">{item.quantity}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleQuantityChange(item, 1)}
                                      disabled={updatingItem === item.id || isAtMax || maxQuantity <= 0}
                                      className="rounded-full p-1.5"
                                      aria-label="Increase quantity"
                                    >
                                      <Plus className="h-4 w-4" />
                                    </button>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeItem(item.id)}
                                    className="shrink-0 rounded-full p-2 opacity-60 transition hover:opacity-100"
                                    style={{ color: "var(--text)" }}
                                    aria-label="Remove item"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div
                    className="flex items-center justify-between gap-3 border-t pt-2.5"
                    style={{ borderColor: "rgba(15,23,42,0.045)" }}
                  >
                    <div className="flex items-baseline gap-2 text-sm min-w-0">
                      <span className="font-medium text-[rgba(15,23,42,0.6)]">Vendor subtotal</span>
                      <span className="font-semibold">${formatMoney(group.subtotal)}</span>
                    </div>
                    {user?.id ? (
                      <Link
                        href={hasStockIssues ? "#" : checkoutHref}
                        aria-disabled={hasStockIssues}
                        onClick={(event) => {
                          if (hasStockIssues) event.preventDefault();
                        }}
                        className={`${checkoutButtonClassName} shrink-0`}
                        style={{
                          background: "#8C81AD",
                          border: "1px solid rgba(109,96,145,0.18)",
                          color: "#FFFFFF",
                          boxShadow: "0 1px 4px rgba(109,96,145,0.08)",
                        }}
                      >
                        Checkout with {businessName}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleGuestCheckout(checkoutHref)}
                        className={`${checkoutButtonClassName} shrink-0`}
                        style={{
                          background: "#8C81AD",
                          border: "1px solid rgba(109,96,145,0.18)",
                          color: "#FFFFFF",
                          boxShadow: "0 1px 4px rgba(109,96,145,0.08)",
                        }}
                      >
                        Sign in to checkout
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24">
            <div
              className="rounded-[28px] p-5"
              style={{
                background: "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(252,249,255,0.98))",
                border: "1px solid rgba(15,23,42,0.05)",
                boxShadow: "0 12px 28px -28px rgba(76,29,149,0.08)",
              }}
            >
              <p className="text-sm font-semibold">All items total</p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="opacity-80">Subtotal</span>
                  <span>${formatMoney(allItemsSubtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="opacity-80">Estimated service fees</span>
                  <span>${formatMoney(fees)}</span>
                </div>
                {deliveryFees > 0 ? (
                  <div className="flex items-center justify-between">
                    <span className="opacity-80">Selected delivery fees</span>
                    <span>${formatMoney(deliveryFees)}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--border)" }}>
                  <span className="text-sm font-semibold">Total</span>
                  <span className="text-sm font-semibold">${formatMoney(total)}</span>
                </div>
              </div>
              <p className="mt-3 text-xs opacity-70">Payment is collected after you confirm delivery or pickup details at checkout.</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
