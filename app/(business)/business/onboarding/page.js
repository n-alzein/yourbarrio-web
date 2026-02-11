"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { BUSINESS_CATEGORIES } from "@/lib/businessCategories";

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
  category: "",
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
  const stateValue = trimValue(values.state).toUpperCase();
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
    return (code || region.short_code).toUpperCase();
  }
  return region.text?.toUpperCase() || "";
}

// ------------------------------
// MAIN COMPONENT (only ONE export default)
// ------------------------------
export default function BusinessOnboardingPage() {
  const { user, loadingUser } = useAuth();
  const router = useRouter();

  const [form, dispatch] = useReducer(formReducer, initialForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const pickedLocationRef = useRef(null); // stores { lat, lng } from address lookup

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

  function formatPhone(value) {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    const parts = [];

    if (digits.length > 0) parts.push("(" + digits.slice(0, 3));
    if (digits.length >= 4) parts.push(") " + digits.slice(3, 6));
    if (digits.length >= 7) parts.push("-" + digits.slice(6, 10));

    return parts.join("");
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
        router.push("/business-auth/login");
        return;
      }

      const normalizedAddress = normalizeAddressPayload(form);
      const validationErrors = validateAddressFields(normalizedAddress);
      if (Object.keys(validationErrors).length > 0) {
        setFieldErrors(validationErrors);
        setMessage("Fix the highlighted address fields.");
        setLoading(false);
        return;
      }

      const normalizedWebsite = normalizeWebsite(form.website);

      // 2) Create or update business entry via server (service role bypasses RLS)
      const res = await fetch("/api/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: verifiedUser.id,
          name: form.businessName,
          category: form.category,
          description: form.description,
          address: normalizedAddress.address,
          address_2: normalizedAddress.address_2,
          city: normalizedAddress.city,
          state: normalizedAddress.state,
          postal_code: normalizedAddress.postal_code,
          phone: form.phone,
          website: normalizedWebsite,
          latitude: pickedLocationRef.current?.lat ?? null,
          longitude: pickedLocationRef.current?.lng ?? null,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to save business");
      }

      const payload = await res.json();

      // 3) Redirect to business profile
      router.push(`/customer/b/${payload.public_id || payload.id}`);
    } catch (err) {
      console.error("Business onboarding failed", err);
      setMessage(err?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-4 sm:px-6 lg:px-10 pt-24 pb-20 relative text-white overflow-hidden">
      <div className="absolute inset-0 bg-[#05010d]" />
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/40 via-slate-950 to-amber-900/30" />
      <div className="absolute -top-32 -left-20 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-amber-400/20 blur-3xl" />

      <div className="relative max-w-6xl mx-auto">
        <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div className="space-y-8">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
                Business onboarding
              </span>
              <h1 className="text-4xl sm:text-5xl font-semibold leading-tight">
                Build a storefront that feels local, modern, and trusted.
              </h1>
              <p className="text-base sm:text-lg text-white/70 max-w-xl">
                Share the essentials now so customers can find you, contact you, and
                start ordering in minutes.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                {
                  title: "Neighborhood discovery",
                  detail: "Appear in nearby searches with accurate location data.",
                },
                {
                  title: "Better conversions",
                  detail: "Clear details increase trust and first-time orders.",
                },
                {
                  title: "Profile ready",
                  detail: "We pre-fill your business page with your brand story.",
                },
                {
                  title: "Flexible updates",
                  detail: "Change any detail later from Business Settings.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4"
                >
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-2 text-sm text-white/60">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 rounded-[28px] bg-gradient-to-br from-emerald-500/10 via-transparent to-amber-500/10" />
            <form
              onSubmit={handleSubmit}
              className="relative rounded-[28px] border border-white/10 bg-white/[0.08] backdrop-blur-2xl shadow-2xl px-6 sm:px-8 py-8 space-y-8"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold">Business details</h2>
                  <p className="text-sm text-white/60">
                    Tell us about your business and where customers can find you.
                  </p>
                </div>
                <div className="h-10 w-10 rounded-2xl border border-white/10 bg-white/10 grid place-items-center text-sm font-semibold">
                  1/1
                </div>
              </div>

              {message && (
                <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {message}
                </div>
              )}

              <FormSection
                title="Basics"
                description="Give shoppers a quick snapshot of what you offer."
              >
                <FormField
                  label="Business name"
                  value={form.businessName}
                  placeholder="e.g., Barrio Coffee House"
                  onChange={(v) => updateField("businessName", v)}
                  required
                />

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Category
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => updateField("category", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 text-white focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400/40 outline-none"
                    required
                  >
                    <option value="" disabled>
                      Select a category
                    </option>
                    {BUSINESS_CATEGORIES.map((cat) => (
                      <option key={cat.slug} value={cat.name} className="text-black">
                        {cat.name}
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
              </FormSection>

              <FormSection
                title="Location"
                description="Accurate address details help customers and delivery teams."
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
                  helper="Enter the street and number."
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

                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    label="City"
                    value={form.city}
                    placeholder="Long Beach"
                    onChange={(v) => updateField("city", v)}
                    required
                    error={fieldErrors.city}
                  />

                  <FormField
                    label="State"
                    value={form.state}
                    placeholder="CA"
                    onChange={(v) => updateField("state", v.toUpperCase())}
                    maxLength={2}
                    required
                    error={fieldErrors.state}
                  />

                  <FormField
                    label="Postal code"
                    value={form.postal_code}
                    placeholder="90802"
                    onChange={(v) => updateField("postal_code", v)}
                    required
                    error={fieldErrors.postal_code}
                  />
                </div>
              </FormSection>

              <FormSection
                title="Contact"
                description="Share how customers can reach you online or by phone."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    label="Phone number"
                    value={form.phone}
                    placeholder="(555) 123-4567"
                    onChange={(v) => updateField("phone", formatPhone(v))}
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

              <button
                type="submit"
                disabled={loading}
                className={`w-full py-3 rounded-xl text-base sm:text-lg font-semibold text-white
                bg-gradient-to-r from-emerald-500 via-teal-500 to-amber-500
                shadow-[0_12px_40px_-20px_rgba(16,185,129,0.8)] transition transform
                ${
                  loading
                    ? "opacity-70 cursor-not-allowed"
                    : "hover:scale-[1.01] active:scale-95"
                }
              `}
              >
                {loading ? "Creating..." : "Create Business Profile"}
              </button>
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
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {description ? (
          <p className="text-sm text-white/60 mt-1">{description}</p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
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
}) {
  const hasError = Boolean(error);
  return (
    <div>
      <label className="block text-sm font-medium mb-1">
        {label}
        {required ? <span className="text-rose-300"> *</span> : null}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={listId}
        required={required}
        maxLength={maxLength}
        className={`w-full px-4 py-3 rounded-xl bg-white/5 border text-sm
          text-white placeholder-white/40 focus:ring-2 focus:border-transparent outline-none
          ${
            hasError
              ? "border-rose-400/80 focus:ring-rose-400/40"
              : "border-white/20 focus:ring-emerald-400/40"
          }`}
      />
      {helper && !hasError ? (
        <p className="mt-2 text-xs text-white/50">{helper}</p>
      ) : null}
      {hasError ? (
        <p className="mt-2 text-xs text-rose-200">{error}</p>
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
  return (
    <div>
      <label className="block text-sm font-medium mb-1">
        {label}
        {required ? <span className="text-rose-300"> *</span> : null}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        required={required}
        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20
          text-white text-sm placeholder-white/40 focus:ring-2 focus:ring-emerald-400/40
          focus:border-transparent outline-none"
      />
    </div>
  );
}
