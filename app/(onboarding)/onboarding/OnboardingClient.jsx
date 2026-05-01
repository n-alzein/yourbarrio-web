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
  const pickedLocationRef = useRef(null); // stores { lat, lng } from address lookup

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.info("[AUTH_REDIRECT_TRACE] onboarding_mount", {
        pathname: window.location.pathname,
      });
    }
  }, []);

  function updateField(field, value, options = {}) {
    dispatch({ field, value });
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
    <div className="relative min-h-screen overflow-hidden bg-[#fbf9ff] px-4 py-8 text-slate-950 sm:px-6 lg:px-10 lg:py-10">
      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-8 lg:min-h-[calc(100vh-5rem)] lg:grid-cols-[0.86fr_1.14fr] lg:items-center xl:gap-12">
          <aside className="px-1 sm:px-2 lg:px-0">
            <div className="max-w-[510px]">
              <div className="flex items-center">
                <Image
                  src="/logo.png"
                  alt="YourBarrio"
                  width={867}
                  height={306}
                  priority
                  className="h-auto w-[178px] object-contain"
                />
              </div>

              <div className="mt-14 max-w-[430px]">
                <p className="text-xs font-bold uppercase tracking-[0.38em] text-purple-700">
                  Local marketplace launch
                </p>
                <h1 className="mt-5 text-4xl font-semibold leading-[1.04] tracking-tight text-slate-950 sm:text-5xl">
                  Open your shop on YourBarrio
                </h1>
                <p className="mt-4 text-base leading-7 text-slate-700">
                  Help nearby customers discover your business, explore what you
                  offer, and reach out in minutes. Set up the essentials now and
                  update your details anytime.
                </p>
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm font-medium text-slate-700">
                {["Free to start", "Edit anytime", "Reach locals"].map((item) => (
                  <span key={item} className="inline-flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-purple-600 text-[#fff]">
                      <svg
                        aria-hidden="true"
                        className="h-3 w-3"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 0 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                    {item}
                  </span>
                ))}
              </div>

              <div className="mt-7 max-w-[430px] rounded-3xl border border-purple-100/70 bg-white/95 p-5 shadow-[0_28px_70px_-44px_rgba(88,28,135,0.36)]">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-[0.32em] text-purple-700">
                    YourBarrio preview
                  </p>
                  <span
                    className="grid h-9 w-9 place-items-center rounded-full bg-purple-600 text-[#fff]"
                    aria-hidden="true"
                  >
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M20.8 4.6c-1.8-1.7-4.6-1.6-6.3.2L12 7.4 9.5 4.8C7.8 3 5 2.9 3.2 4.6c-1.9 1.8-2 4.9-.1 6.8L12 20l8.9-8.6c1.9-1.9 1.8-5-.1-6.8Z" />
                    </svg>
                  </span>
                </div>

                <div className="mt-4 grid gap-5 sm:grid-cols-[1fr_128px]">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        Jewelry & Accessories
                      </span>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        Popular nearby
                      </span>
                    </div>
                    <h2 className="mt-4 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-950">
                      Luna Studio
                      <span className="h-2.5 w-2.5 rounded-full bg-purple-400" />
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Handcrafted pieces, keepsakes, and gifts for everyday wear.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2.5 text-sm text-slate-600">
                      <span className="font-semibold text-slate-950">4.8 star</span>
                      <span>24 reviews</span>
                      <span className="h-1 w-1 rounded-full bg-slate-300" />
                      <span>12 saves</span>
                      <span className="h-1 w-1 rounded-full bg-slate-300" />
                      <span className="text-slate-500/75">Updated recently</span>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl bg-transparent">
                    <Image
                      src="/images/categories/jewelry-accessories.png"
                      alt=""
                      width={128}
                      height={156}
                      className="h-36 w-full object-cover"
                    />
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <div className="relative">
            <form
              onSubmit={handleSubmit}
              className="relative rounded-[28px] border border-purple-100/80 bg-white px-5 py-6 text-slate-950 shadow-[0_24px_80px_-48px_rgba(41,20,89,0.45)] sm:px-8 sm:py-8"
            >
              <div className="flex flex-col gap-4 border-b border-purple-100/70 pb-6 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-purple-700">
                    Launch your local shop
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    Business details
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                    Add the essentials customers need to discover, trust, and contact
                    your business.
                  </p>
                </div>
                <div className="inline-flex w-fit min-w-[92px] whitespace-nowrap items-center gap-2 rounded-full border border-purple-100/70 bg-purple-50/55 px-3.5 py-2 text-xs font-medium text-purple-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                  Step 1 of 1
                </div>
              </div>

              {message && (
                <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {message}
                </div>
              )}

              <div className="mt-8 space-y-8">

              <FormSection
                title="Basics"
                description="Start with the name and category customers will recognize."
              >
                <FormField
                  label="Business name"
                  value={form.businessName}
                  placeholder="e.g., Luna Studio"
                  onChange={(v) => updateField("businessName", v)}
                  required
                />

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-800">
                    Business type
                  </label>
                  <select
                    value={form.business_type}
                    onChange={(e) => updateField("business_type", e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-purple-400 focus:ring-4 focus:ring-purple-500/15"
                    required
                  >
                    <option value="" disabled>
                      Select a business type
                    </option>
                    {BUSINESS_TYPE_OPTIONS.map((type) => (
                      <option key={type.slug} value={type.slug}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <FormTextArea
                  label="Description"
                  value={form.description}
                  placeholder="Share what makes your business special..."
                  rows={4}
                  onChange={(v) => updateField("description", v)}
                  required
                />
                <AIDescriptionAssistant
                  type="business"
                  name={form.businessName}
                  category={form.business_type}
                  value={form.description}
                  onApply={(description) => updateField("description", description)}
                  context="onboarding"
                />
              </FormSection>

              <FormSection
                title="Location"
                description="Use the address customers should associate with your shop."
              >
                <FormField
                  label="Street address"
                  value={form.address}
                  placeholder="123 Pine St"
                  listId="address-suggestions"
                  onChange={(v) => {
                    updateField("address", v);
                    const match = addressSuggestions.find(
                      (item) => item.label === v
                    );
                    if (match) {
                      applySuggestion(match);
                    }
                  }}
                  required
                  helper="Use the storefront, studio, or service address customers should see."
                  error={fieldErrors.address}
                />

                {addressSuggestions.length ? (
                  <datalist id="address-suggestions">
                    {addressSuggestions.map((item) => (
                      <option key={item.label} value={item.label} />
                    ))}
                  </datalist>
                ) : null}

                <FormField
                  label="Apt / Suite / Unit"
                  value={form.address_2}
                  placeholder="Suite 203"
                  onChange={(v) => updateField("address_2", v)}
                  helper="Optional"
                />

                <div className="grid gap-5 md:grid-cols-3">
                  <FormField
                    label="City"
                    value={form.city}
                    placeholder="City"
                    onChange={(v) => updateField("city", v)}
                    required
                    error={fieldErrors.city}
                  />

                  <FormField
                    label="State"
                    value={form.state}
                    placeholder="Select state"
                    onChange={(v) => updateField("state", v)}
                    required
                    error={fieldErrors.state}
                    options={US_STATES.map((stateOption) => ({
                      value: stateOption.code,
                      label: `${stateOption.code} - ${stateOption.name}`,
                    }))}
                  />

                  <FormField
                    label="Postal code"
                    value={form.postal_code}
                    placeholder="ZIP code"
                    onChange={(v) => updateField("postal_code", v)}
                    required
                    error={fieldErrors.postal_code}
                  />
                </div>
              </FormSection>

              <FormSection
                title="Contact"
                description="Give nearby customers a clear way to reach you."
              >
                <div className="grid gap-5 md:grid-cols-2">
                  <FormField
                    label="Business phone"
                    value={form.phone}
                    placeholder="(555) 123-4567"
                    onChange={(v) => updateField("phone", formatUSPhone(v))}
                    helper="This number may be shown to customers on your business profile."
                    error={fieldErrors.phone}
                  />

                  <FormField
                    label="Website"
                    value={form.website}
                    placeholder="yourbusiness.com"
                    onChange={(v) => updateField("website", v)}
                    helper="We will add https:// automatically."
                  />
                </div>
              </FormSection>

                <div className="-mb-1 rounded-2xl border border-purple-100 bg-white px-4 py-2 text-xs leading-5 text-slate-500/85">
                  <span className="font-semibold text-purple-700">Free to start.</span> Nearby
                  customers can discover your storefront after setup, and you can
                  edit details anytime.
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#6e34ff] to-[#7538ee] px-5 py-3.5 text-base font-bold text-[#fff] shadow-[0_12px_28px_-18px_rgba(110,52,255,0.64)] transition hover:from-[#5e2de0] hover:to-[#6d28d9] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-300/40 disabled:cursor-not-allowed disabled:from-purple-300 disabled:to-purple-300 disabled:shadow-none"
                >
                  {loading ? "Creating..." : "Launch your storefront"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------
// Reusable inputs
// ------------------------------
function FormSection({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-purple-100/70 bg-white p-5 shadow-[0_10px_30px_-24px_rgba(88,28,135,0.45)] sm:p-6">
      <div className="mb-5 flex items-start gap-2">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-50/50 p-0 text-purple-500">
          <SectionIcon title={title} />
        </div>
        <div>
          <h3 className="text-base font-semibold tracking-tight text-slate-950">{title}</h3>
          {description ? (
            <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function SectionIcon({ title }) {
  if (title === "Location") {
    return (
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    );
  }

  if (title === "Contact") {
    return (
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11Z" />
        <path d="m6.5 8 5.5 4 5.5-4" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M5 20V7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5V20" />
      <path d="M3 20h18" />
      <path d="M9 9h6" />
      <path d="M9 13h6" />
    </svg>
  );
}

function FormField({
  label,
  value,
  placeholder,
  onChange,
  type = "text",
  required = false,
  listId,
  helper,
  error,
  maxLength,
  options,
}) {
  const hasError = Boolean(error);
  const inputClassName = [
    "w-full rounded-xl border bg-white px-4 py-3 text-sm text-slate-950 shadow-sm",
    "placeholder:text-slate-400 outline-none transition focus:ring-4",
    hasError
      ? "border-rose-300 focus:border-rose-400 focus:ring-rose-500/15"
      : "border-slate-200 focus:border-purple-400 focus:ring-purple-500/15",
  ].join(" ");
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-800">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </label>
      {Array.isArray(options) && options.length ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className={inputClassName}
        >
          <option value="">{placeholder || "Select an option"}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
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

function FormTextArea({
  label,
  value,
  placeholder,
  onChange,
  rows = 3,
  required = false,
}) {
  const textareaClassName = [
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm",
    "placeholder:text-slate-400 outline-none transition focus:border-purple-400 focus:ring-4 focus:ring-purple-500/15",
  ].join(" ");
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-800">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </label>
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
