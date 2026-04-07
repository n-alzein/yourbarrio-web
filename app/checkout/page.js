"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCart } from "@/components/cart/CartProvider";
import { useAuth } from "@/components/AuthProvider";
import { useCurrentAccountContext } from "@/lib/auth/useCurrentAccountContext";
import {
  getPurchaseRestrictionHelpText,
  getPurchaseRestrictionMessage,
} from "@/lib/auth/purchaseAccess";
import { US_STATES } from "@/lib/constants/usStates";
import { normalizeStateCode } from "@/lib/location/normalizeStateCode";
import { calculatePlatformFeeDollars } from "@/lib/stripe/fees";

const formatMoney = (value) => {
  const amount = Number(value || 0);
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const TIME_OPTIONS = [
  { value: "ASAP", label: "ASAP" },
  { value: "morning", label: "Morning (9am-12pm)" },
  { value: "afternoon", label: "Afternoon (12pm-4pm)" },
  { value: "evening", label: "Evening (4pm-8pm)" },
];

export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const { user, profile } = useAuth();
  const accountContext = useCurrentAccountContext();
  const { loading, setFulfillmentType, vendorGroups } = useCart();
  const businessIdParam = (searchParams.get("business_id") || "").trim();
  const purchaseRestricted = accountContext.purchaseRestricted;
  const purchaseEligibilityPending = accountContext.rolePending;

  const selectedGroup = useMemo(() => {
    if (businessIdParam) {
      return vendorGroups.find((group) => group.business_id === businessIdParam) || null;
    }
    if (vendorGroups.length === 1) {
      return vendorGroups[0];
    }
    return null;
  }, [businessIdParam, vendorGroups]);

  const vendor = selectedGroup?.vendor || null;
  const items = useMemo(() => selectedGroup?.items || [], [selectedGroup?.items]);

  const [form, setForm] = useState({
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    delivery_address1: "",
    delivery_address2: "",
    delivery_city: "",
    delivery_state: "",
    delivery_postal_code: "",
    delivery_instructions: "",
    delivery_time: "ASAP",
    pickup_time: "ASAP",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [fulfillmentType, setFulfillmentTypeState] = useState("");

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0), 0),
    [items]
  );
  const fees = useMemo(() => calculatePlatformFeeDollars(subtotal), [subtotal]);
  const total = subtotal + fees;

  useEffect(() => {
    if (selectedGroup?.fulfillment_type) {
      setFulfillmentTypeState(selectedGroup.fulfillment_type);
      return;
    }
    setFulfillmentTypeState("");
  }, [selectedGroup?.fulfillment_type, selectedGroup?.cart_id]);

  const handleFulfillmentSelect = async (nextType) => {
    if (!selectedGroup) return;
    setError(null);
    setFulfillmentTypeState(nextType);
    const result = await setFulfillmentType(nextType, {
      cartId: selectedGroup.cart_id,
      businessId: selectedGroup.business_id,
    });
    if (result?.error) {
      setError(result.error);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const hasProfileInfo = Boolean(
    user?.email ||
      profile?.email ||
      profile?.full_name ||
      profile?.phone ||
      profile?.address ||
      profile?.address_2 ||
      profile?.city ||
      profile?.state ||
      profile?.postal_code
  );

  const handlePrefillFromProfile = () => {
    if (!hasProfileInfo) return;
    setForm((prev) => ({
      ...prev,
      contact_name: profile?.full_name?.trim() || prev.contact_name,
      contact_phone: profile?.phone?.trim() || prev.contact_phone,
      contact_email: profile?.email?.trim() || user?.email?.trim() || prev.contact_email,
      delivery_address1: profile?.address?.trim() || prev.delivery_address1,
      delivery_address2: profile?.address_2?.trim() || prev.delivery_address2,
      delivery_city: profile?.city?.trim() || prev.delivery_city,
      delivery_state: normalizeStateCode(profile?.state) || prev.delivery_state,
      delivery_postal_code: profile?.postal_code?.trim() || prev.delivery_postal_code,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedGroup) return;
    if (!fulfillmentType) {
      setError("Select delivery or pickup to continue.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/checkout/create-session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart_id: selectedGroup.cart_id,
          business_id: selectedGroup.business_id,
          fulfillment_type: fulfillmentType,
          ...form,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "Failed to start checkout");
      }

      window.location.href = payload.url;
    } catch (err) {
      setError(err?.message || "Failed to start checkout");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen px-4 md:px-8 lg:px-12 py-12" style={{ background: "var(--background)", color: "var(--text)" }}>
        <div className="max-w-5xl mx-auto h-64 rounded-3xl animate-pulse" style={{ background: "var(--surface)" }} />
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

  if (!vendorGroups.length) {
    return (
      <div className="min-h-screen px-4 md:px-8 lg:px-12 py-12" style={{ background: "var(--background)", color: "var(--text)" }}>
        <div className="max-w-4xl mx-auto rounded-3xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h1 className="text-2xl font-semibold">Your cart is empty</h1>
          <p className="mt-3 text-sm opacity-80">Add items before checking out.</p>
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

  if (!selectedGroup) {
    return (
      <div className="min-h-screen px-4 md:px-8 lg:px-12 py-12" style={{ background: "var(--background)", color: "var(--text)" }}>
        <div className="max-w-4xl mx-auto rounded-3xl p-8" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <p className="text-xs uppercase tracking-[0.2em] opacity-70">Checkout</p>
          <h1 className="text-2xl font-semibold mt-2">Choose a vendor to checkout</h1>
          <p className="mt-2 text-sm opacity-80">Each vendor is checked out separately.</p>
          <div className="mt-6 space-y-3">
            {vendorGroups.map((group) => {
              const businessName = group.business_name || "Local vendor";
              const href = group.business_id ? `/checkout?business_id=${encodeURIComponent(group.business_id)}` : "/cart";
              return (
                <Link
                  key={group.business_id || businessName}
                  href={href}
                  className="flex items-center justify-between rounded-2xl px-4 py-3"
                  style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                >
                  <span className="text-sm font-semibold">{businessName}</span>
                  <span className="text-xs opacity-80">${formatMoney(group.subtotal)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 md:px-8 lg:px-12 py-12" style={{ background: "var(--background)", color: "var(--text)" }}>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] opacity-70">Checkout</p>
          <h1 className="text-3xl font-semibold">Submit your order request</h1>
          <p className="mt-2 mb-4 text-sm opacity-80">
            Vendor: {vendor?.business_name || vendor?.full_name || selectedGroup.business_name || "Local vendor"}
          </p>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-3xl p-6"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="space-y-3 mb-10">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="text-lg font-semibold">Contact</h2>
                <button
                  type="button"
                  onClick={handlePrefillFromProfile}
                  disabled={!hasProfileInfo}
                  className="rounded-full px-4 py-1.5 text-xs font-semibold transition"
                  style={{
                    background: hasProfileInfo ? "var(--overlay)" : "transparent",
                    border: "1px solid var(--border)",
                    opacity: hasProfileInfo ? 1 : 0.5,
                  }}
                >
                  Add my info
                </button>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <input
                  name="contact_name"
                  value={form.contact_name}
                  onChange={handleChange}
                  placeholder="Full name"
                  required
                  className="rounded-xl px-3 py-2 text-sm"
                  style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                />
                <input
                  name="contact_phone"
                  value={form.contact_phone}
                  onChange={handleChange}
                  placeholder="Phone number"
                  required
                  className="rounded-xl px-3 py-2 text-sm"
                  style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                />
                <input
                  name="contact_email"
                  value={form.contact_email}
                  onChange={handleChange}
                  placeholder="Email"
                  type="email"
                  className="rounded-xl px-3 py-2 text-sm md:col-span-2"
                  style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                />
              </div>
            </div>

            <div className="space-y-3 mt-6 mb-8">
              <h2 className="text-lg font-semibold mb-4">Fulfillment</h2>
              <div className="grid md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleFulfillmentSelect("delivery")}
                  className={`rounded-xl px-3 py-3 text-sm font-semibold transition ${
                    fulfillmentType === "delivery" ? "ring-2 ring-indigo-500/40" : ""
                  }`}
                  style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                >
                  Delivery
                </button>
                <button
                  type="button"
                  onClick={() => handleFulfillmentSelect("pickup")}
                  className={`rounded-xl px-3 py-3 text-sm font-semibold transition ${
                    fulfillmentType === "pickup" ? "ring-2 ring-indigo-500/40" : ""
                  }`}
                  style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                >
                  Pickup
                </button>
              </div>
              {!fulfillmentType ? (
                <p className="text-xs opacity-70">Choose delivery or pickup to continue.</p>
              ) : null}
            </div>

            {fulfillmentType === "delivery" ? (
              <div className="space-y-3 mt-6 mb-8">
                <h2 className="text-lg font-semibold mb-4">Delivery details</h2>
                <div className="grid md:grid-cols-2 gap-3">
                  <input
                    name="delivery_address1"
                    value={form.delivery_address1}
                    onChange={handleChange}
                    placeholder="Street address"
                    required
                    className="rounded-xl px-3 py-2 text-base md:text-sm md:col-span-2"
                    style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                  />
                  <input
                    name="delivery_address2"
                    value={form.delivery_address2}
                    onChange={handleChange}
                    placeholder="Apt, suite, etc."
                    className="rounded-xl px-3 py-2 text-base md:text-sm md:col-span-2"
                    style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                  />
                  <input
                    name="delivery_city"
                    value={form.delivery_city}
                    onChange={handleChange}
                    placeholder="City"
                    className="rounded-xl px-3 py-2 text-base md:text-sm"
                    style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                  />
                  <select
                    name="delivery_state"
                    value={form.delivery_state}
                    onChange={handleChange}
                    className="rounded-xl px-3 py-2 text-base md:text-sm"
                    style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                  >
                    <option value="">Select state</option>
                    {US_STATES.map((stateOption) => (
                      <option key={stateOption.code} value={stateOption.code}>
                        {stateOption.code} - {stateOption.name}
                      </option>
                    ))}
                  </select>
                  <input
                    name="delivery_postal_code"
                    value={form.delivery_postal_code}
                    onChange={handleChange}
                    placeholder="Postal code"
                    className="rounded-xl px-3 py-2 text-base md:text-sm"
                    style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                  />
                  <select
                    name="delivery_time"
                    value={form.delivery_time}
                    onChange={handleChange}
                    className="rounded-xl px-3 py-2 text-base md:text-sm"
                    style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                  >
                    {TIME_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <textarea
                    name="delivery_instructions"
                    value={form.delivery_instructions}
                    onChange={handleChange}
                    placeholder="Delivery instructions"
                    rows={3}
                    className="rounded-xl px-3 py-2 text-sm md:col-span-2"
                    style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                  />
                </div>
              </div>
            ) : fulfillmentType === "pickup" ? (
              <div className="space-y-3 mt-6 mb-8">
                <h2 className="text-lg font-semibold">Pickup details</h2>
                {vendor?.address || vendor?.city ? (
                  <p className="text-sm opacity-80">
                    {vendor?.address ? `${vendor.address}${vendor?.city ? `, ${vendor.city}` : ""}` : vendor?.city}
                  </p>
                ) : null}
                <div className="grid md:grid-cols-2 gap-3 mt-3">
                  <select
                    name="pickup_time"
                    value={form.pickup_time}
                    onChange={handleChange}
                    className="rounded-xl px-3 py-2 text-base md:text-sm"
                    style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                  >
                    {TIME_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            <div
              className="rounded-2xl p-4 text-sm my-6"
              style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
            >
              <p className="font-semibold">Review &amp; confirm</p>
              <ul className="mt-2 space-y-1 text-xs opacity-80">
                <li>Your contact and fulfillment details will be sent with the Stripe checkout.</li>
                <li>Review and pay securely in Stripe after this step.</li>
              </ul>
            </div>

            {error ? <p className="text-sm text-rose-200">{error}</p> : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full px-5 py-3 text-sm font-semibold"
              style={{ background: "var(--text)", color: "var(--background)", opacity: submitting ? 0.7 : 1 }}
            >
              {submitting ? "Redirecting..." : "Continue to Stripe"}
            </button>
          </form>

          <div className="space-y-4">
            <div className="rounded-3xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-sm font-semibold">Order summary</p>
              <div className="mt-4 space-y-2 text-sm">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between">
                    <span className="opacity-80">{item.title} x{item.quantity}</span>
                    <span>${formatMoney(Number(item.unit_price || 0) * Number(item.quantity || 0))}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="opacity-80">Subtotal</span>
                  <span>${formatMoney(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="opacity-80">Service fee</span>
                  <span>${formatMoney(fees)}</span>
                </div>
                <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--border)" }}>
                  <span className="text-sm font-semibold">Total</span>
                  <span className="text-sm font-semibold">${formatMoney(total)}</span>
                </div>
              </div>
              <p className="mt-3 text-xs opacity-70">You’ll review payment and billing details on Stripe next.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
