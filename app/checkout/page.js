"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCart } from "@/components/cart/CartProvider";
import EmptyCartState from "@/components/cart/EmptyCartState";
import SafeImage from "@/components/SafeImage";
import { useAuth } from "@/components/AuthProvider";
import { useModal } from "@/components/modals/ModalProvider";
import { useCurrentAccountContext } from "@/lib/auth/useCurrentAccountContext";
import { clearAuthIntent, clearCheckoutIntentPending, setAuthIntent } from "@/lib/auth/authIntent";
import {
  getPurchaseRestrictionHelpText,
  getPurchaseRestrictionMessage,
} from "@/lib/auth/purchaseAccess";
import { US_STATES } from "@/lib/constants/usStates";
import { normalizeStateCode } from "@/lib/location/normalizeStateCode";
import {
  DELIVERY_FULFILLMENT_TYPE,
  PICKUP_FULFILLMENT_TYPE,
} from "@/lib/fulfillment";
import { calculateCheckoutPricing } from "@/lib/pricing";
import {
  formatUSPhone,
  isIncompleteUSPhone,
  normalizeUSPhoneForStorage,
} from "@/lib/utils/formatUSPhone";

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

function PickupTimeDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const selectedOption =
    TIME_OPTIONS.find((option) => option.value === value) || TIME_OPTIONS[0];

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!dropdownRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const commitSelection = (nextValue) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative w-full max-w-[220px]">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
          if (event.key === "Escape") setOpen(false);
        }}
        className="flex w-full items-center justify-between rounded-[6px] px-2.5 py-1.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/40"
        style={{
          background: "rgba(255,255,255,0.72)",
          border: "1px solid var(--border)",
          color: "var(--text)",
        }}
      >
        <span>{selectedOption.label}</span>
        <span aria-hidden="true" className="text-xs opacity-55">⌄</span>
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label="Pickup time"
          className="absolute left-0 top-[calc(100%+6px)] z-20 w-full overflow-hidden rounded-[8px] py-1 shadow-lg"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          {TIME_OPTIONS.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => commitSelection(option.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    commitSelection(option.value);
                  }
                  if (event.key === "Escape") setOpen(false);
                }}
                className="w-full px-2.5 py-2 text-left text-sm transition hover:bg-purple-50/70 focus:bg-purple-50/70 focus:outline-none"
                style={{ color: "var(--text)", fontWeight: selected ? 600 : 400 }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const getCheckoutItemImageUrl = (item) => item?.image_url || "/business-placeholder.png";

const getCheckoutItemVariantLabel = (item) => {
  if (item?.variant_label) return item.variant_label;
  if (!item?.selected_options || typeof item.selected_options !== "object") return "";
  return Object.entries(item.selected_options)
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}: ${value}`)
    .join(" · ");
};

const isExpiredReservationItem = (item) => {
  const expiresAt = item?.reservation_expires_at ? Date.parse(item.reservation_expires_at) : NaN;
  return (
    (Number.isFinite(expiresAt) && expiresAt <= Date.now()) ||
    String(item?.stock_error || "").toLowerCase().includes("reservation expired")
  );
};

export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const { user, profile } = useAuth();
  const { openModal } = useModal();
  const accountContext = useCurrentAccountContext();
  const { loading, refreshCart, setFulfillmentType, updateItem, vendorGroups } = useCart();
  const businessIdParam = (searchParams.get("business_id") || "").trim();
  const purchaseRestricted = accountContext.purchaseRestricted;
  const purchaseEligibilityPending = accountContext.rolePending;
  const promptedLoginRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);

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
  const availableFulfillmentMethods = selectedGroup?.available_fulfillment_methods || [];
  const isPickupOnly =
    availableFulfillmentMethods.includes(PICKUP_FULFILLMENT_TYPE) &&
    !availableFulfillmentMethods.includes(DELIVERY_FULFILLMENT_TYPE);
  const stockIssues = useMemo(
    () =>
      items.filter(
        (item) =>
          isExpiredReservationItem(item) ||
          item.stock_error ||
          Number(item.quantity || 0) > Number(item.max_order_quantity || 0)
      ),
    [items]
  );

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
  const [contactEditing, setContactEditing] = useState(false);
  const [contactDraft, setContactDraft] = useState({
    contact_name: "",
    contact_phone: "",
    contact_email: "",
  });
  const [contactError, setContactError] = useState(null);
  const [updatingReservationItemId, setUpdatingReservationItemId] = useState(null);
  const submittedRef = useRef(false);
  const profilePrefilledRef = useRef(false);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0), 0),
    [items]
  );
  const deliveryFee = useMemo(
    () =>
      fulfillmentType === DELIVERY_FULFILLMENT_TYPE
        ? Number(selectedGroup?.delivery_fee_cents || 0) / 100
        : 0,
    [fulfillmentType, selectedGroup?.delivery_fee_cents]
  );
  const pricing = useMemo(
    () =>
      calculateCheckoutPricing({
        subtotalCents: Math.round(subtotal * 100),
        deliveryFeeCents: Math.round(deliveryFee * 100),
        taxCents: 0,
      }),
    [deliveryFee, subtotal]
  );
  const fees = pricing.platformFeeCents / 100;
  const tax = pricing.taxCents / 100;
  const total = pricing.totalCents / 100;
  const hasInvalidCheckoutItems = stockIssues.length > 0;

  useEffect(() => {
    setHydrated(true);
    clearAuthIntent();
    clearCheckoutIntentPending();
  }, []);

  useEffect(() => {
    if (selectedGroup?.fulfillment_type) {
      setFulfillmentTypeState(selectedGroup.fulfillment_type);
      return;
    }
    setFulfillmentTypeState("");
  }, [selectedGroup?.fulfillment_type, selectedGroup?.cart_id]);

  useEffect(() => {
    if (user?.id || loading || promptedLoginRef.current) return;
    promptedLoginRef.current = true;
    const next =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/checkout";
    setAuthIntent({ redirectTo: next, role: "customer" });
    openModal("customer-login", { next });
  }, [loading, openModal, user?.id]);

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

  const savedContactInfo = useMemo(
    () => ({
      name: form.contact_name?.trim() || "",
      email: form.contact_email?.trim() || "",
      phone: form.contact_phone?.trim() || "",
    }),
    [form.contact_email, form.contact_name, form.contact_phone]
  );
  const hasRequiredSavedContactInfo = Boolean(savedContactInfo.name && savedContactInfo.phone);
  const showContactInputs = contactEditing || !hasRequiredSavedContactInfo;
  const savedContactParts = useMemo(
    () =>
      [
        savedContactInfo.name,
        savedContactInfo.email,
        savedContactInfo.phone ? formatUSPhone(savedContactInfo.phone) : "",
      ].filter(Boolean),
    [savedContactInfo.email, savedContactInfo.name, savedContactInfo.phone]
  );

  const handlePrefillFromProfile = useCallback(() => {
    if (!hasProfileInfo) return;
    setForm((prev) => ({
      ...prev,
      contact_name: profile?.full_name?.trim() || prev.contact_name,
      contact_phone: profile?.phone ? formatUSPhone(profile.phone) : prev.contact_phone,
      contact_email: profile?.email?.trim() || user?.email?.trim() || prev.contact_email,
      delivery_address1: profile?.address?.trim() || prev.delivery_address1,
      delivery_address2: profile?.address_2?.trim() || prev.delivery_address2,
      delivery_city: profile?.city?.trim() || prev.delivery_city,
      delivery_state: normalizeStateCode(profile?.state) || prev.delivery_state,
      delivery_postal_code: profile?.postal_code?.trim() || prev.delivery_postal_code,
    }));
    setContactDraft((prev) => ({
      contact_name: profile?.full_name?.trim() || prev.contact_name,
      contact_phone: profile?.phone ? formatUSPhone(profile.phone) : prev.contact_phone,
      contact_email: profile?.email?.trim() || user?.email?.trim() || prev.contact_email,
    }));
  }, [
    hasProfileInfo,
    profile?.address,
    profile?.address_2,
    profile?.city,
    profile?.email,
    profile?.full_name,
    profile?.phone,
    profile?.postal_code,
    profile?.state,
    user?.email,
  ]);

  useEffect(() => {
    if (profilePrefilledRef.current || !hasProfileInfo) return;
    profilePrefilledRef.current = true;
    handlePrefillFromProfile();
  }, [handlePrefillFromProfile, hasProfileInfo]);

  useEffect(() => {
    if (contactEditing) return;
    setContactDraft({
      contact_name: form.contact_name,
      contact_phone: form.contact_phone,
      contact_email: form.contact_email,
    });
  }, [contactEditing, form.contact_email, form.contact_name, form.contact_phone]);

  const handleContactDraftChange = (event) => {
    const { name, value } = event.target;
    setContactDraft((prev) => ({
      ...prev,
      [name]: name === "contact_phone" ? formatUSPhone(value) : value,
    }));
    setContactError(null);
  };

  const handlePickupTimeChange = (nextValue) => {
    setForm((prev) => ({ ...prev, pickup_time: nextValue }));
  };

  const handleEditContact = () => {
    setContactDraft({
      contact_name: form.contact_name,
      contact_phone: form.contact_phone,
      contact_email: form.contact_email,
    });
    setContactError(null);
    setContactEditing(true);
  };

  const handleCancelContactEdit = () => {
    setContactDraft({
      contact_name: form.contact_name,
      contact_phone: form.contact_phone,
      contact_email: form.contact_email,
    });
    setContactError(null);
    setContactEditing(false);
  };

  const handleSaveContact = () => {
    const nextContact = {
      contact_name: contactDraft.contact_name.trim(),
      contact_phone: contactDraft.contact_phone.trim(),
      contact_email: contactDraft.contact_email.trim(),
    };
    if (!nextContact.contact_name || !nextContact.contact_phone) {
      setContactError("Add your name and phone number before continuing.");
      return;
    }
    if (isIncompleteUSPhone(nextContact.contact_phone)) {
      setContactError("Enter a complete phone number.");
      return;
    }
    nextContact.contact_phone =
      normalizeUSPhoneForStorage(nextContact.contact_phone) || nextContact.contact_phone;
    if (nextContact.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextContact.contact_email)) {
      setContactError("Enter a valid email address.");
      return;
    }
    setForm((prev) => ({
      ...prev,
      ...nextContact,
    }));
    setContactDraft(nextContact);
    setContactError(null);
    setContactEditing(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submittedRef.current) return;
    if (!selectedGroup) return;
    if (!fulfillmentType) {
      setError("Select delivery or pickup to continue.");
      return;
    }
    if (stockIssues.length > 0) {
      setError("Adjust unavailable cart quantities before checkout.");
      return;
    }

    submittedRef.current = true;
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
      submittedRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateCartItem = async (item) => {
    if (!item?.id) return;
    setUpdatingReservationItemId(item.id);
    setError(null);
    try {
      const result = await updateItem({
        itemId: item.id,
        quantity: Number(item.quantity || 0),
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      await refreshCart({ reason: "checkout-reservation-refresh" });
    } catch (err) {
      setError(err?.message || "Failed to update cart");
    } finally {
      setUpdatingReservationItemId(null);
    }
  };

  if (!hydrated || loading) {
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

  if (!user?.id) {
    return (
      <div className="min-h-screen px-4 md:px-8 lg:px-12 py-12" style={{ background: "var(--background)", color: "var(--text)" }}>
        <div className="max-w-4xl mx-auto rounded-3xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h1 className="text-2xl font-semibold">Sign in to continue to checkout</h1>
          <p className="mt-3 text-sm opacity-80">Your cart is saved on this device. Sign in to submit your order request.</p>
          <button
            type="button"
            onClick={() => {
              const next =
                typeof window !== "undefined"
                  ? `${window.location.pathname}${window.location.search}`
                  : "/checkout";
              setAuthIntent({ redirectTo: next, role: "customer" });
              openModal("customer-login", { next });
            }}
            className="mt-6 inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold"
            style={{ background: "var(--text)", color: "var(--background)" }}
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  if (!vendorGroups.length) {
    return <EmptyCartState />;
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
    <div
      className="flex w-full max-w-full flex-col justify-between overflow-x-hidden px-4 pb-12 pt-8 md:px-8 lg:px-12"
      style={{
        background: "var(--background)",
        color: "var(--text)",
        minHeight: "calc(100vh - var(--yb-nav-h, 0px))",
      }}
    >
      <div
        className="mx-auto flex w-full max-w-full flex-1 flex-col justify-between lg:max-w-[1100px]"
        style={{ minHeight: "calc(100vh - var(--yb-nav-h, 0px) - 80px)" }}
      >
        <div className="space-y-10">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] opacity-70">Checkout</p>
            <h1 className="mt-2 text-3xl font-semibold">Review your order</h1>
            <p className="mt-4 min-w-0 break-words text-sm opacity-65">
              Pickup from {vendor?.business_name || vendor?.full_name || selectedGroup.business_name || "Local vendor"}
            </p>
          </div>

          <div className="grid w-full max-w-full min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
            <form onSubmit={handleSubmit} className="flex w-full max-w-full min-w-0 flex-col justify-between lg:order-1">
              <div className="min-w-0">
                <div className="space-y-5 pb-12" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Contact</h2>
                {showContactInputs ? (
                  <div className="flex max-w-full flex-wrap items-center gap-2">
                    {hasRequiredSavedContactInfo ? (
                      <button
                        type="button"
                        onClick={handleCancelContactEdit}
                        className="rounded-[6px] px-2.5 py-1 text-xs font-semibold transition"
                        style={{ color: "var(--muted)" }}
                      >
                        Cancel
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleSaveContact}
                      className="rounded-[6px] px-3 py-1.5 text-xs font-semibold transition hover:bg-purple-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/40"
                      style={{
                        background: "rgba(255,255,255,0.72)",
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                      }}
                    >
                      Save
                    </button>
                  </div>
                ) : null}
              </div>
              {hasRequiredSavedContactInfo && !showContactInputs ? (
                <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-w-0 break-words opacity-85">{savedContactParts.join(" · ")}</p>
                  <button
                    type="button"
                    onClick={handleEditContact}
                    className="self-start rounded-[6px] px-1 py-0.5 text-xs font-semibold transition sm:self-auto"
                    style={{ color: "var(--muted)" }}
                  >
                    Edit
                  </button>
                </div>
              ) : null}
              {showContactInputs ? (
                <div className="space-y-4">
                  <p className="text-xs font-semibold opacity-70">Edit contact info</p>
                  <div className="grid min-w-0 gap-5 md:grid-cols-2">
                    <input
                      name="contact_name"
                      value={contactDraft.contact_name}
                      onChange={handleContactDraftChange}
                      placeholder="Full name"
                      required
                      className="w-full min-w-0 rounded-xl px-3 py-2 text-sm"
                      style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                    />
                    <input
                      name="contact_phone"
                      value={contactDraft.contact_phone}
                      onChange={handleContactDraftChange}
                      placeholder="Phone number"
                      required
                      className="w-full min-w-0 rounded-xl px-3 py-2 text-sm"
                      style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                    />
                    <input
                      name="contact_email"
                      value={contactDraft.contact_email}
                      onChange={handleContactDraftChange}
                      placeholder="Email"
                      type="email"
                      className="w-full min-w-0 rounded-xl px-3 py-2 text-sm md:col-span-2"
                      style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                    />
                  </div>
                  {contactError ? <p className="text-xs text-rose-200">{contactError}</p> : null}
                </div>
              ) : null}
            </div>

            {!isPickupOnly ? (
              <div className="space-y-2 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
                <h2 className="text-base font-semibold">Fulfillment</h2>
                <div className="grid min-w-0 gap-3 md:grid-cols-2">
                  {selectedGroup?.available_fulfillment_methods?.includes(
                    DELIVERY_FULFILLMENT_TYPE
                  ) ? (
                    <button
                      type="button"
                      onClick={() => handleFulfillmentSelect(DELIVERY_FULFILLMENT_TYPE)}
                      className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                        fulfillmentType === DELIVERY_FULFILLMENT_TYPE
                          ? "ring-2 ring-purple-500/25"
                          : ""
                      }`}
                      style={{
                        background:
                          fulfillmentType === DELIVERY_FULFILLMENT_TYPE
                            ? "rgba(124,58,237,0.1)"
                            : "var(--overlay)",
                        border:
                          fulfillmentType === DELIVERY_FULFILLMENT_TYPE
                            ? "1px solid rgba(124,58,237,0.32)"
                            : "1px solid var(--border)",
                      }}
                    >
                      Delivery
                    </button>
                  ) : null}
                  {selectedGroup?.available_fulfillment_methods?.includes(
                    PICKUP_FULFILLMENT_TYPE
                  ) ? (
                    <button
                      type="button"
                      onClick={() => handleFulfillmentSelect(PICKUP_FULFILLMENT_TYPE)}
                      className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                        fulfillmentType === PICKUP_FULFILLMENT_TYPE
                          ? "ring-2 ring-purple-500/25"
                          : ""
                      }`}
                      style={{
                        background:
                          fulfillmentType === PICKUP_FULFILLMENT_TYPE
                            ? "rgba(124,58,237,0.1)"
                            : "var(--overlay)",
                        border:
                          fulfillmentType === PICKUP_FULFILLMENT_TYPE
                            ? "1px solid rgba(124,58,237,0.32)"
                            : "1px solid var(--border)",
                      }}
                    >
                      Pickup
                    </button>
                  ) : null}
                </div>
                {!fulfillmentType ? (
                  <p className="text-xs opacity-70">Choose delivery or pickup to continue.</p>
                ) : null}
              </div>
            ) : null}

            {fulfillmentType === DELIVERY_FULFILLMENT_TYPE ? (
              <div className="space-y-5 py-6">
                <h2 className="text-base font-semibold">Delivery details</h2>
                <p className="text-xs opacity-75">
                  Delivery fee: ${formatMoney(deliveryFee)}
                  {selectedGroup?.delivery_notes ? ` • ${selectedGroup.delivery_notes}` : ""}
                </p>
                <div className="grid min-w-0 gap-3 md:grid-cols-2">
                  <input
                    name="delivery_address1"
                    value={form.delivery_address1}
                    onChange={handleChange}
                    placeholder="Street address"
                    required
                    className="w-full min-w-0 rounded-xl px-3 py-2 text-base md:text-sm md:col-span-2"
                    style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                  />
                  <input
                    name="delivery_address2"
                    value={form.delivery_address2}
                    onChange={handleChange}
                    placeholder="Apt, suite, etc."
                    className="w-full min-w-0 rounded-xl px-3 py-2 text-base md:text-sm md:col-span-2"
                    style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                  />
                  <input
                    name="delivery_city"
                    value={form.delivery_city}
                    onChange={handleChange}
                    placeholder="City"
                    className="w-full min-w-0 rounded-xl px-3 py-2 text-base md:text-sm"
                    style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                  />
                  <select
                    name="delivery_state"
                    value={form.delivery_state}
                    onChange={handleChange}
                    className="w-full min-w-0 rounded-xl px-3 py-2 text-base md:text-sm"
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
                    className="w-full min-w-0 rounded-xl px-3 py-2 text-base md:text-sm"
                    style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                  />
                  <select
                    name="delivery_time"
                    value={form.delivery_time}
                    onChange={handleChange}
                    className="w-full min-w-0 rounded-xl px-3 py-2 text-base md:text-sm"
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
                    className="w-full min-w-0 rounded-xl px-3 py-2 text-sm md:col-span-2"
                    style={{ background: "var(--overlay)", border: "1px solid var(--border)" }}
                  />
                </div>
              </div>
            ) : fulfillmentType === PICKUP_FULFILLMENT_TYPE ? (
              <div className="space-y-4 py-6">
                <h2 className="text-base font-semibold">Pickup</h2>
                {isPickupOnly ? (
                  <p className="text-[11px] opacity-55">Available for pickup only.</p>
                ) : null}
                <div className="space-y-5 text-sm">
                  {vendor?.address || vendor?.city ? (
                    <p className="opacity-85">
                      {vendor?.address ? `${vendor.address}${vendor?.city ? `, ${vendor.city}` : ""}` : vendor?.city}
                    </p>
                  ) : null}
                  <PickupTimeDropdown value={form.pickup_time} onChange={handlePickupTimeChange} />
                </div>
              </div>
            ) : null}

              </div>

              <div className="mt-8 w-full max-w-full min-w-0 pt-6" style={{ borderTop: "1px solid var(--border)" }}>
                {error ? <p className="mb-3 text-sm text-rose-200">{error}</p> : null}

                <button
                  type="submit"
                  disabled={submitting || hasInvalidCheckoutItems}
                  className="w-full max-w-full whitespace-normal rounded-[8px] px-5 py-3 text-center text-sm font-semibold leading-tight transition disabled:cursor-not-allowed"
                  style={{
                    background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                    color: "white",
                    opacity: submitting || hasInvalidCheckoutItems ? 0.72 : 1,
                  }}
                >
                  {submitting
                    ? "Preparing secure checkout…"
                    : hasInvalidCheckoutItems
                      ? "Update cart to continue"
                      : "Continue to payment"}
                </button>
                <p className="mt-2.5 max-w-full px-1 text-center text-xs opacity-70">Secure checkout with Stripe</p>
              </div>
            </form>

          <div className="order-first w-full max-w-full min-w-0 space-y-4 lg:order-2">
            <div className="w-full max-w-full min-w-0 rounded-3xl p-5 sm:p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-sm font-semibold">Order summary</p>
              <div className="mt-4 space-y-3 text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-45">Items</p>
                {items.map((item) => {
                  const variantLabel = getCheckoutItemVariantLabel(item);
                  const reservationExpired = isExpiredReservationItem(item);
                  const quantityUnavailable =
                    Number(item.quantity || 0) > Number(item.max_order_quantity || 0);
                  const itemHasIssue =
                    reservationExpired ||
                    Boolean(item.stock_error) ||
                    quantityUnavailable;
                  return (
                    <div key={item.id} className="min-w-0">
                      <div className="flex min-w-0 items-start gap-3">
                        <SafeImage
                          src={getCheckoutItemImageUrl(item)}
                          alt={item.title || "Order item"}
                          width={64}
                          height={64}
                          className="h-16 w-16 shrink-0 rounded-2xl bg-[rgba(15,23,42,0.03)] object-contain object-center"
                          useNextImage
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold leading-snug">{item.title}</p>
                          <p className="mt-1 text-xs opacity-65">
                            Qty {item.quantity}
                            {variantLabel ? ` · ${variantLabel}` : ""}
                          </p>
                          {item.reservation_expires_at && !reservationExpired ? (
                            <p className="mt-1 text-xs opacity-70">Reserved in your cart for 30 minutes.</p>
                          ) : null}
                          {reservationExpired ? (
                            <div
                              className="mt-3 space-y-1 rounded-[6px] px-2.5 py-2 text-xs"
                              style={{
                                background: "rgba(245,158,11,0.1)",
                                color: "#b45309",
                              }}
                            >
                              <p className="font-semibold">⚠ This item is no longer reserved.</p>
                              <p className="opacity-80">Availability may have changed.</p>
                              <button
                                type="button"
                                onClick={() => handleUpdateCartItem(item)}
                                disabled={updatingReservationItemId === item.id}
                                className="mt-1.5 rounded-[6px] px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed"
                                style={{
                                  background: "rgba(255,255,255,0.55)",
                                  border: "1px solid rgba(180,83,9,0.28)",
                                  color: "#92400e",
                                }}
                              >
                                {updatingReservationItemId === item.id ? "Updating..." : "Update cart"}
                              </button>
                            </div>
                          ) : item.stock_error ? (
                            <div className="mt-2 space-y-1 text-xs text-rose-200">
                              <p>{item.stock_error}</p>
                              {itemHasIssue ? (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateCartItem(item)}
                                  disabled={updatingReservationItemId === item.id}
                                  className="mt-1 rounded-[6px] px-2 py-1 text-xs font-semibold transition disabled:cursor-not-allowed"
                                  style={{ border: "1px solid rgba(251,113,133,0.32)", color: "var(--text)" }}
                                >
                                  {updatingReservationItemId === item.id ? "Updating..." : "Update cart"}
                                </button>
                              ) : null}
                            </div>
                          ) : quantityUnavailable ? (
                            <div
                              className="mt-3 space-y-1 rounded-[6px] px-2.5 py-2 text-xs"
                              style={{
                                background: "rgba(245,158,11,0.1)",
                                color: "#b45309",
                              }}
                            >
                              <p className="font-semibold">Availability may have changed.</p>
                              <button
                                type="button"
                                onClick={() => handleUpdateCartItem(item)}
                                disabled={updatingReservationItemId === item.id}
                                className="mt-1.5 rounded-[6px] px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed"
                                style={{
                                  background: "rgba(255,255,255,0.55)",
                                  border: "1px solid rgba(180,83,9,0.28)",
                                  color: "#92400e",
                                }}
                              >
                                {updatingReservationItemId === item.id ? "Updating..." : "Update cart"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <span className="ml-auto max-w-[7rem] shrink-0 text-right font-semibold">
                          ${formatMoney(Number(item.unit_price || 0) * Number(item.quantity || 0))}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 space-y-2 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-45">Fees</p>
                <div className="flex min-w-0 items-center justify-between gap-4">
                  <span className="min-w-0 truncate opacity-80">Merchant item subtotal</span>
                  <span className="shrink-0 text-right">${formatMoney(subtotal)}</span>
                </div>
                {deliveryFee > 0 ? (
                  <div className="flex min-w-0 items-center justify-between gap-4">
                    <span className="min-w-0 truncate opacity-80">Delivery fee</span>
                    <span className="shrink-0 text-right">${formatMoney(deliveryFee)}</span>
                  </div>
                ) : null}
                <div className="flex min-w-0 items-center justify-between gap-4">
                  <span className="min-w-0 truncate opacity-80">Service fee</span>
                  <span className="shrink-0 text-right">${formatMoney(fees)}</span>
                </div>
                {tax > 0 ? (
                  <div className="flex min-w-0 items-center justify-between gap-4">
                    <span className="min-w-0 truncate opacity-80">Tax</span>
                    <span className="shrink-0 text-right">${formatMoney(tax)}</span>
                  </div>
                ) : null}
                <div className="mt-4 flex min-w-0 items-center justify-between gap-4 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                  <span className="min-w-0 truncate text-base font-semibold">Total</span>
                  <span className="shrink-0 text-right text-xl font-semibold">${formatMoney(total)}</span>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
