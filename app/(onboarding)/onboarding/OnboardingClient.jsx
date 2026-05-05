"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import AIDescriptionAssistant from "@/components/business/AIDescriptionAssistant";
import { getBusinessTypeOptions } from "@/lib/taxonomy/businessTypes";
import { isBusinessOnboardingComplete } from "@/lib/business/onboardingCompletion";
import { US_STATES } from "@/lib/constants/usStates";
import { normalizeStateCode } from "@/lib/location/normalizeStateCode";
import {
  formatUSPhone,
  isIncompleteUSPhone,
  normalizeUSPhoneForStorage,
} from "@/lib/utils/formatUSPhone";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const PLACES_DISABLED =
  process.env.NEXT_PUBLIC_DISABLE_PLACES === "true" ||
  process.env.NEXT_PUBLIC_DISABLE_PLACES === "1" ||
  (process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DISABLE_PLACES !== "false");

const ADDRESS_FIELDS = new Set(["address", "address_2", "city", "state", "postal_code"]);

// ------------------------------
// State + reducer (must be ABOVE component)
// ------------------------------
const initialForm = {
  businessName: "",
  business_type: "",
  description: "",
  address: "",
  address_2: "",
  city: "",
  state: "",
  postal_code: "",
  phone: "",
  website: "",
};

function formReducer(state, action) {
  return { ...state, [action.field]: action.value };
}

function normalizeWebsite(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

function normalizeAddressPayload(values) {
  const trimValue = (value) => (value ?? "").trim();
  const stateValue = normalizeStateCode(trimValue(values.state)) || "";
  const postalValue = trimValue(values.postal_code);
  return {
    address: trimValue(values.address),
    address_2: trimValue(values.address_2),
    city: trimValue(values.city),
    state: stateValue,
    postal_code: postalValue,
  };
}

function validateAddressFields(values) {
  const errors = {};
  const hasStreet = Boolean(values.address);
  const hasCity = Boolean(values.city);
  const hasState = Boolean(values.state);
  const hasPostal = Boolean(values.postal_code);

  if (!hasStreet) {
    errors.address = "Street address is required.";
  }

  if (!hasCity) {
    errors.city = "City is required.";
  }

  if (!hasState) {
    errors.state = "State is required.";
  }

  if (!hasPostal) {
    errors.postal_code = "Postal code is required.";
  }

  if (hasState && !/^[A-Z]{2}$/.test(values.state)) {
    errors.state = "Use a 2-letter state code (e.g., CA).";
  }

  if (hasPostal && !/^[0-9]{5}(-[0-9]{4})?$/.test(values.postal_code)) {
    errors.postal_code = "Use ZIP or ZIP+4 (e.g., 94107 or 94107-1234).";
  }

  return errors;
}

function buildAddressQuery(values) {
  return [values.address, values.city, values.state, values.postal_code]
    .map((value) => (value || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function extractContextValue(feature, prefix) {
  if (!feature?.context) return null;
  return feature.context.find((item) => item.id?.startsWith(`${prefix}.`)) || null;
}

function resolveStateCode(region) {
  if (!region) return "";
  if (region.short_code) {
    const code = region.short_code.split("-").pop();
    return normalizeStateCode(code || region.short_code) || "";
  }
  return normalizeStateCode(region.text) || "";
}

const BUSINESS_TYPE_OPTIONS = getBusinessTypeOptions();

// ------------------------------
// MAIN COMPONENT (only ONE export default)
// ------------------------------
export default function BusinessOnboardingPage() {
  const { user, loadingUser, refreshProfile } = useAuth();
  const router = useRouter();

  const [form, dispatch] = useReducer(formReducer, initialForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [basicInteracted, setBasicInteracted] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPulse, setPreviewPulse] = useState(false);
  const pickedLocationRef = useRef(null); // stores { lat, lng } from address lookup

  const selectedBusinessType =
    BUSINESS_TYPE_OPTIONS.find((type) => type.slug === form.business_type) || null;
  const hasBasicProgress = basicInteracted || Boolean(form.businessName || form.business_type);
  const previewName = form.businessName.trim() || "Your shop";
  const previewType = selectedBusinessType?.label || "Local business";
  const previewDescription =
    form.description.trim() ||
    "A quick, welcoming description will appear here as you shape your shop.";
  const previewState =
    US_STATES.find((stateOption) => stateOption.code === form.state)?.name || form.state;
  const previewLocation = [form.city, previewState].filter(Boolean).join(", ") || "Nearby";

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.info("[AUTH_REDIRECT_TRACE] onboarding_mount", {
        pathname: window.location.pathname,
      });
    }
  }, []);

  function updateField(field, value, options = {}) {
    dispatch({ field, value });
    if (field === "businessName" || field === "business_type") {
      setBasicInteracted(true);
    }
    if (ADDRESS_FIELDS.has(field) && !options.keepLocation) {
      pickedLocationRef.current = null;
    }
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function updateFields(payload, options = {}) {
    Object.entries(payload).forEach(([field, value]) =>
      updateField(field, value, options)
    );
  }

  useEffect(() => {
    if (!MAPBOX_TOKEN || PLACES_DISABLED) {
      setAddressSuggestions([]);
      return;
    }

    const query = buildAddressQuery({
      address: form.address,
      city: form.city,
      state: form.state,
      postal_code: form.postal_code,
    });
    if (query.length < 3) {
      setAddressSuggestions([]);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const url = new URL(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            query
          )}.json`
        );
        url.searchParams.set("access_token", MAPBOX_TOKEN);
        url.searchParams.set("types", "address");
        url.searchParams.set("limit", "5");
        url.searchParams.set("autocomplete", "true");

        const res = await fetch(url.toString());
        if (!res.ok) return;
        const payload = await res.json();
        const nextSuggestions = (payload.features || [])
          .map((feature) => {
            const center = Array.isArray(feature.center) ? feature.center : [];
            const [lng, lat] = center;
            if (typeof lat !== "number" || typeof lng !== "number") return null;

            const addressNumber = feature.address || feature.properties?.address || "";
            const streetLine = [addressNumber, feature.text]
              .filter(Boolean)
              .join(" ")
              .trim();
            const place = extractContextValue(feature, "place");
            const locality = extractContextValue(feature, "locality");
            const region = extractContextValue(feature, "region");
            const postcode = extractContextValue(feature, "postcode");
            const city = place?.text || locality?.text || "";
            const state = resolveStateCode(region);
            const postal_code = postcode?.text || "";

            return {
              label: feature.place_name || streetLine || feature.text,
              address: streetLine || feature.text,
              city,
              state,
              postal_code,
              coords: { lat, lng },
            };
          })
          .filter(Boolean);
        if (!cancelled) {
          setAddressSuggestions(nextSuggestions);
        }
      } catch (err) {
        if (!cancelled) {
          setAddressSuggestions([]);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [form.address, form.city, form.state, form.postal_code]);

  function applySuggestion(item) {
    updateFields(
      {
        address: item.address || form.address,
        city: item.city || form.city,
        state: item.state || form.state,
        postal_code: item.postal_code || form.postal_code,
      },
      { keepLocation: true }
    );
    pickedLocationRef.current = item.coords;
  }

  useEffect(() => {
    setPreviewPulse(true);
    const handle = setTimeout(() => setPreviewPulse(false), 180);
    return () => clearTimeout(handle);
  }, [
    form.businessName,
    form.business_type,
    form.description,
    form.city,
    form.state,
    form.phone,
    form.website,
  ]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (loadingUser) {
        setLoading(false);
        return;
      }

      const verifiedUser = user;
      if (!verifiedUser) {
        setMessage("You must be logged in to create a business.");
        setLoading(false);
        router.push("/business/login");
        return;
      }

      const normalizedAddress = normalizeAddressPayload(form);
      const validationErrors = validateAddressFields(normalizedAddress);
      if (!String(form.business_type || "").trim()) {
        validationErrors.business_type = "Choose a shop category.";
      }
      if (isIncompleteUSPhone(form.phone)) {
        validationErrors.phone = "Enter a complete 10-digit US phone number.";
      }
      if (Object.keys(validationErrors).length > 0) {
        setFieldErrors(validationErrors);
        setMessage("Fix the highlighted fields.");
        setLoading(false);
        return;
      }

      const normalizedWebsite = normalizeWebsite(form.website);

      // 2) Create or update business entry via authenticated server route
      const res = await fetch("/api/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.businessName,
          business_type: form.business_type,
          description: form.description,
          address: normalizedAddress.address,
          address_2: normalizedAddress.address_2,
          city: normalizedAddress.city,
          state: normalizedAddress.state,
          postal_code: normalizedAddress.postal_code,
          phone: normalizeUSPhoneForStorage(form.phone),
          website: normalizedWebsite,
          latitude: pickedLocationRef.current?.lat ?? null,
          longitude: pickedLocationRef.current?.lng ?? null,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        if (process.env.NODE_ENV !== "production") {
          console.error("[onboarding] business save failed", {
            status: res.status,
            code: errBody?.code || null,
            message: errBody?.error || "Failed to save business",
          });
        }
        throw new Error(errBody.error || "Failed to save business");
      }

      const payload = await res.json();
      const savedRow = payload?.row || null;
      if (process.env.NODE_ENV !== "production") {
        console.warn("[AUTH_REDIRECT_TRACE] onboarding_submit_saved_row", {
          keys: Object.keys(savedRow || {}),
        });
      }

      if (!savedRow || !isBusinessOnboardingComplete(savedRow)) {
        setMessage("Business profile save was incomplete. Please try again.");
        setLoading(false);
        return;
      }

      // 3) Redirect to business workspace
      await refreshProfile();
      router.replace("/business/dashboard");
      router.refresh();
    } catch (err) {
      console.error("Onboarding submit failed", err);
      setMessage(err?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fbf9ff] px-4 pb-32 pt-6 text-slate-950 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto grid max-w-7xl gap-10 lg:min-h-[calc(100vh-5rem)] lg:grid-cols-[45fr_55fr] lg:items-center xl:gap-14">
        <aside className="hidden lg:block">
          <ShopPreview
            name={previewName}
            type={previewType}
            description={previewDescription}
            location={previewLocation}
            pulse={previewPulse}
          />
        </aside>

        <main className="mx-auto w-full max-w-[680px] lg:max-w-none">
          <form id="business-onboarding-form" onSubmit={handleSubmit} className="w-full">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-[32px] font-semibold leading-tight tracking-normal text-slate-950">
                  Launch your shop
                </h1>
                <p className="mt-2 text-sm text-slate-500">Takes less than 2 minutes</p>
              </div>
              <span className="mt-2 whitespace-nowrap text-xs font-medium text-slate-500">
                Step 1 of 2
              </span>
            </div>

            {message ? (
              <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {message}
              </div>
            ) : null}

            <div>
              <FormField
                label="Business name"
                value={form.businessName}
                placeholder="Your shop name"
                onChange={(v) => updateField("businessName", v)}
                onFocus={() => setBasicInteracted(true)}
                required
                large
              />

              <div className="mt-5">
                <FormField
                  label="Business type"
                  value={form.business_type}
                  placeholder="Choose your shop category"
                  onChange={(v) => updateField("business_type", v)}
                  onFocus={() => setBasicInteracted(true)}
                  required
                  options={BUSINESS_TYPE_OPTIONS.map((type) => ({
                    value: type.slug,
                    label: type.label,
                  }))}
                  error={fieldErrors.business_type}
                />
              </div>

              {hasBasicProgress ? (
                <div className="mt-[18px] overflow-visible [animation:onboardingFadeSlide_150ms_ease-out]">
                  <FormTextArea
                    label="Description"
                    value={form.description}
                    placeholder="Describe your shop"
                    rows={4}
                    onChange={(v) => updateField("description", v)}
                    required
                    action={
                      <AIDescriptionAssistant
                        type="business"
                        name={form.businessName}
                        category={form.business_type}
                        value={form.description}
                        onApply={(description) => updateField("description", description)}
                        context="onboarding"
                        compact
                        label="Generate with AI"
                      />
                    }
                  />

                <div className="mt-7 border-t border-slate-200/60 pt-7">
                  <FormField
                    label="Street address"
                    value={form.address}
                    placeholder="Street address"
                    listId="address-suggestions"
                    onChange={(v) => {
                      updateField("address", v);
                      const match = addressSuggestions.find((item) => item.label === v);
                      if (match) {
                        applySuggestion(match);
                      }
                    }}
                    required
                    error={fieldErrors.address}
                  />

                  {addressSuggestions.length ? (
                    <datalist id="address-suggestions">
                      {addressSuggestions.map((item) => (
                        <option key={item.label} value={item.label} />
                      ))}
                    </datalist>
                  ) : null}

                  <div className="mt-[18px] grid items-start gap-[18px] sm:grid-cols-[1fr_0.62fr_0.84fr]">
                    <FormField
                      label="City"
                      value={form.city}
                      placeholder=""
                      onChange={(v) => updateField("city", v)}
                      required
                      error={fieldErrors.city}
                    />

                    <FormField
                      label="State"
                      value={form.state}
                      placeholder=""
                      onChange={(v) => updateField("state", v)}
                      required
                      error={fieldErrors.state}
                      options={US_STATES.map((stateOption) => ({
                        value: stateOption.code,
                        label: stateOption.code,
                      }))}
                    />

                    <FormField
                      label="ZIP"
                      value={form.postal_code}
                      placeholder=""
                      onChange={(v) => updateField("postal_code", v)}
                      required
                      error={fieldErrors.postal_code}
                    />
                  </div>

                  <div className="mt-[18px]">
                    <FormField
                      label="Apt / Suite"
                      value={form.address_2}
                      placeholder=""
                      onChange={(v) => updateField("address_2", v)}
                    />
                  </div>
                </div>

                <div className="mt-7">
                  <button
                    type="button"
                    onClick={() => setContactOpen((open) => !open)}
                    className="inline-flex items-center gap-2 text-left text-xs font-medium text-slate-400 transition hover:text-[#6e34ff]"
                  >
                    Add contact details (optional)
                    <span
                      className={[
                        "text-sm text-slate-400 transition-transform duration-150",
                        contactOpen ? "rotate-180" : "",
                      ].join(" ")}
                    >
                      ↓
                    </span>
                  </button>

                  <div
                    className={[
                      "grid transition-all duration-150 ease-out",
                      contactOpen
                        ? "mt-[18px] max-h-64 translate-y-0 overflow-visible opacity-100"
                        : "max-h-0 -translate-y-1 overflow-hidden opacity-0",
                    ].join(" ")}
                  >
                    <div className="grid gap-[18px] sm:grid-cols-2">
                      <FormField
                        label="Business phone"
                        value={form.phone}
                        placeholder=""
                        onChange={(v) => updateField("phone", formatUSPhone(v))}
                        helper="Visible to customers on your shop page"
                        error={fieldErrors.phone}
                      />

                      <FormField
                        label="Website"
                        value={form.website}
                        placeholder="yourdomain.com"
                        onChange={(v) => updateField("website", v)}
                      />
                    </div>
                  </div>
                </div>

                <div className="hidden pt-7 sm:block">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex h-[52px] w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#6e34ff] to-[#7b3ff2] px-5 text-[15px] font-semibold text-[#FFFFFF] shadow-[0_14px_28px_-22px_rgba(110,52,255,0.72)] transition duration-[120ms] ease-out hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/45 disabled:cursor-not-allowed disabled:from-[#ebe7f4] disabled:to-[#ebe7f4] disabled:text-[#9f96ad] disabled:shadow-none disabled:hover:brightness-100 disabled:active:scale-100"
                  >
                    {loading ? "Launching..." : "Launch my shop"}
                  </button>
                  <p className="mt-2 text-center text-xs font-medium text-slate-500">
                    Free to start • No setup fees • Edit anytime
                  </p>
                </div>
                </div>
              ) : null}
            </div>
          </form>
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 bg-white/95 px-4 py-3 shadow-[0_-18px_40px_-28px_rgba(15,23,42,0.45)] backdrop-blur sm:hidden">
        <div className="mx-auto max-w-[680px]">
          <div className="mb-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="text-xs font-semibold text-slate-600"
            >
              Your shop preview
            </button>
            <p className="text-xs font-medium text-slate-400">
              Free to start • No setup fees
            </p>
          </div>
          <button
            type="submit"
            form="business-onboarding-form"
            disabled={loading}
            className="flex h-[52px] w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#6e34ff] to-[#7b3ff2] px-5 text-[15px] font-semibold text-[#FFFFFF] shadow-[0_14px_28px_-22px_rgba(110,52,255,0.72)] transition duration-[120ms] ease-out hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:from-[#ebe7f4] disabled:to-[#ebe7f4] disabled:text-[#9f96ad] disabled:shadow-none disabled:hover:brightness-100 disabled:active:scale-100"
          >
            {loading ? "Launching..." : "Launch my shop"}
          </button>
        </div>
      </div>

      {previewOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm sm:hidden">
          <button
            type="button"
            aria-label="Close preview"
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={() => setPreviewOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[28px] bg-[#fbf9ff] p-4 shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" />
            <ShopPreview
              name={previewName}
              type={previewType}
              description={previewDescription}
              location={previewLocation}
              pulse={previewPulse}
              compact
            />
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        @keyframes onboardingFadeSlide {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <style jsx global>{`
        @keyframes dropdownFadeSlide {
          from {
            opacity: 0;
            transform: translateY(-3px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

function ShopPreview({ name, type, description, location, pulse, compact = false }) {
  return (
    <div
      className={[
        "max-w-[500px] rounded-[28px] bg-white shadow-[0_32px_90px_-56px_rgba(15,23,42,0.65)] transition duration-150",
        compact ? "max-w-none p-5" : "p-6 xl:p-7",
        pulse ? "scale-[1.01] shadow-[0_36px_96px_-54px_rgba(15,23,42,0.72)]" : "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-slate-900">Your shop preview</p>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          Updates live
        </span>
      </div>

      <div className="relative mt-5 overflow-hidden rounded-2xl bg-slate-100">
        <Image
          src="/placeholders/business/types/boutique.png"
          alt=""
          width={720}
          height={420}
          className={[
            compact ? "h-28" : "h-44",
            "w-full object-cover brightness-[0.92] contrast-[0.96] saturate-[0.94]",
          ].join(" ")}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/14 via-transparent to-white/10" />
      </div>

      <div className="mt-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {type}
          </span>
          <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
            {location}
          </span>
        </div>

        <h2 className="mt-3 break-words text-2xl font-semibold leading-tight tracking-normal text-slate-950">
          {name}
        </h2>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
          {description}
        </p>

        <p className="mt-5 text-xs font-medium text-slate-500">
          <span className="font-semibold text-slate-700">Almost ready</span>
          {" — add your details to publish"}
        </p>
      </div>
    </div>
  );
}

// ------------------------------
// Reusable inputs
// ------------------------------

function FormField({
  label,
  value,
  placeholder,
  onChange,
  onFocus,
  type = "text",
  required = false,
  listId,
  helper,
  error,
  maxLength,
  options,
  large = false,
}) {
  const hasError = Boolean(error);
  const inputClassName = [
    "w-full rounded-xl border bg-white px-4 text-base text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.035)]",
    large ? "h-[52px]" : "h-12",
    "placeholder:text-slate-400 outline-none transition focus:outline-none focus:ring-0 focus:shadow-[0_0_0_2px_rgba(110,52,255,0.15)]",
    hasError
      ? "border-rose-300 focus:border-rose-400 focus:shadow-[0_0_0_2px_rgba(244,63,94,0.14)]"
      : "border-slate-200/80 focus:border-[#6e34ff]",
  ].join(" ");
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-800">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </label>
      {Array.isArray(options) && options.length ? (
        <CustomDropdown
          value={value}
          onChange={onChange}
          onFocus={onFocus}
          placeholder={placeholder ?? "Select an option"}
          options={options}
          className={inputClassName}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          placeholder={placeholder}
          list={listId}
          required={required}
          maxLength={maxLength}
          className={inputClassName}
        />
      )}
      {helper && !hasError ? (
        <p className="mt-2.5 text-xs leading-5 text-slate-500">{helper}</p>
      ) : null}
      {hasError ? (
        <p className="mt-2.5 text-xs font-medium leading-5 text-rose-600">{error}</p>
      ) : null}
    </div>
  );
}

function CustomDropdown({ value, onChange, onFocus, placeholder, options, className }) {
  const [open, setOpen] = useState(false);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const [activeIndex, setActiveIndex] = useState(selectedIndex >= 0 ? selectedIndex : 0);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const itemRefs = useRef([]);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function openMenu() {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
    onFocus?.();
  }

  function selectOption(option) {
    onChange(option.value);
    setOpen(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        const next = current + direction;
        if (next < 0) return options.length - 1;
        if (next >= options.length) return 0;
        return next;
      });
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex(options.length - 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      const option = options[activeIndex];
      if (option) selectOption(option);
    }
  }

  return (
    <div className="relative overflow-visible" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        onFocus={onFocus}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${className} flex items-center justify-between gap-3 text-left`}
      >
        <span
          className={[
            "min-w-0 flex-1 truncate",
            selectedOption ? "text-slate-950" : "text-slate-400",
          ].join(" ")}
        >
          {selectedOption?.label || placeholder}
        </span>
        <svg
          aria-hidden="true"
          className={[
            "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150",
            open ? "rotate-180" : "",
          ].join(" ")}
          viewBox="0 0 20 20"
          fill="none"
        >
          <path
            d="m5 7.5 5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-40 mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-[#E5E7EB] bg-white py-1.5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.45)] [animation:dropdownFadeSlide_120ms_ease-out]"
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            const active = index === activeIndex;
            return (
              <button
                key={option.value}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
                className={[
                  "flex h-9 w-full items-center justify-between gap-3 px-3 text-left text-sm transition",
                  active ? "bg-purple-50/70" : "bg-white",
                  selected ? "font-semibold text-[#6e34ff]" : "font-medium text-slate-700",
                ].join(" ")}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {selected ? (
                  <svg
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 text-[#6e34ff]"
                    viewBox="0 0 20 20"
                    fill="none"
                  >
                    <path
                      d="m4.5 10.5 3.2 3.2 7.8-7.8"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function FormTextArea({
  label,
  value,
  placeholder,
  onChange,
  rows = 3,
  required = false,
  action,
}) {
  const textareaClassName = [
    "h-24 w-full resize-none rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-base text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.035)]",
    "placeholder:text-slate-400 outline-none transition focus:border-[#6e34ff] focus:outline-none focus:ring-0 focus:shadow-[0_0_0_2px_rgba(110,52,255,0.15)]",
  ].join(" ");
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="block text-sm font-semibold text-slate-800">
          {label}
          {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
        </label>
        {action}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        required={required}
        className={textareaClassName}
      />
    </div>
  );
}
