"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import SafeAvatar from "@/components/SafeAvatar";
import { useRouter } from "next/navigation";
import { getBusinessByUserId } from "@/lib/business/getBusinessByUserId";
import {
  getAuthProviderLabel,
  getPrimaryAuthProvider,
} from "@/lib/getAuthProvider";
import { PATHS } from "@/lib/auth/paths";
import {
  Field,
  FieldGrid,
  SettingsSection,
} from "@/components/settings/SettingsSection";
import ManagePasswordDialog from "@/components/settings/ManagePasswordDialog";
import { US_STATES } from "@/lib/constants/usStates";
import {
  centsToDollarsInput,
  dollarsInputToCents,
} from "@/lib/fulfillment";
import { normalizeStateCode } from "@/lib/location/normalizeStateCode";

function parseOptionalNonNegativeNumber(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return Number.NaN;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

const editableSections = new Set(["profile", "address", "fulfillment"]);

const sectionCardClassName =
  "rounded-[28px] border border-slate-200/80 bg-white px-5 py-5 shadow-[0_12px_36px_rgba(15,23,42,0.06)] sm:px-7 sm:py-6";
const sectionHeaderClassName =
  "mb-5 gap-3 border-b border-slate-100 pb-4";
const sectionTitleClassName = "text-[1.05rem] font-semibold text-slate-950";
const sectionDescriptionClassName = "mt-1 max-w-2xl text-sm leading-6 text-slate-500";
const sectionBodyClassName = "space-y-5";
const sectionFooterClassName =
  "mt-6 border-t border-slate-100 pt-4 sm:justify-end";
const businessInputClassName =
  "h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition placeholder:text-slate-400 focus-visible:outline-none focus-visible:border-violet-500 focus-visible:ring-4 focus-visible:ring-violet-500/15";
const businessTextareaClassName = `${businessInputClassName} h-auto min-h-[110px] py-3`;
const readOnlyFieldClassName =
  "flex min-h-11 items-center rounded-2xl border border-slate-200 bg-slate-50/70 px-3.5 text-sm text-slate-700";
const fieldLabelClassName = "font-medium text-slate-800";
const fieldHelperClassName = "text-slate-500";
const fieldErrorClassName = "text-rose-600";
const secondaryButtonClassName =
  "inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/15 disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClassName =
  "inline-flex h-10 items-center justify-center rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/20 disabled:cursor-not-allowed disabled:bg-violet-300";

function SectionActionButton({ children, ...props }) {
  return (
    <button type="button" className={secondaryButtonClassName} {...props}>
      {children}
    </button>
  );
}

function SectionSaveButton({ children, className = "", ...props }) {
  return (
    <button
      type="button"
      className={`${primaryButtonClassName} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function ToggleField({ id, checked, onChange, label, helper, disabled }) {
  return (
    <label
      htmlFor={id}
      className={`flex min-h-[76px] items-start gap-3 rounded-2xl border px-4 py-4 transition ${
        disabled
          ? "cursor-default border-slate-200 bg-slate-50/80"
          : "cursor-pointer border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-violet-600 peer-focus-visible:ring-4 peer-focus-visible:ring-violet-500/20" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
      </span>
      <span className="space-y-1">
        <span className="block text-sm font-semibold text-slate-900">
          {label}
        </span>
        <span className="block text-xs leading-5 text-slate-500">
          {helper}
        </span>
      </span>
    </label>
  );
}

function ReadOnlyField({ value, multiline = false }) {
  if (multiline) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3.5 py-3 text-sm leading-6 text-slate-700">
        {value || "—"}
      </div>
    );
  }

  return <div className={readOnlyFieldClassName}>{value || "—"}</div>;
}

export default function SettingsPage() {
  const { user, profile, supabase, loadingUser, logout, refreshProfile } =
    useAuth();
  const router = useRouter();

  /* -----------------------------------------------------------
     HOOKS (always first — no conditional hooks)
  ----------------------------------------------------------- */
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [toast, setToast] = useState(null);
  const [managePasswordOpen, setManagePasswordOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const toastTimerRef = useRef(null);

  const buildInitialForm = (profile) => ({
    full_name: profile?.business_name || profile?.full_name || "",
    phone: profile?.phone || "",
    city: profile?.city || "",
    address: profile?.address || "",
    address_2: profile?.address_2 || "",
    state: normalizeStateCode(profile?.state) || "",
    postal_code: profile?.postal_code || "",
    website: profile?.website || "",
    profile_photo_url: profile?.profile_photo_url || "",
    pickup_enabled_default: profile?.pickup_enabled_default !== false,
    local_delivery_enabled_default:
      profile?.local_delivery_enabled_default === true,
    default_delivery_fee: centsToDollarsInput(
      profile?.default_delivery_fee_cents
    ),
    delivery_radius_miles:
      profile?.delivery_radius_miles != null
        ? String(profile.delivery_radius_miles)
        : "",
    delivery_min_order: centsToDollarsInput(profile?.delivery_min_order_cents),
    delivery_notes: profile?.delivery_notes || "",
  });

  const [form, setForm] = useState(() => buildInitialForm(profile));
  const [initialForm, setInitialForm] = useState(() => buildInitialForm(profile));
  const lastUserIdRef = useRef(profile?.id ?? null);

  const showToast = (type, message) => {
    setToast({ type, message });
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  const beginSectionEdit = (sectionKey) => {
    if (!editableSections.has(sectionKey) || saving) return;
    setActiveSection(sectionKey);
    setFieldErrors({});
  };

  const cancelSectionEdit = () => {
    setActiveSection(null);
    setForm(initialForm);
    setFieldErrors({});
  };

  const handleFieldChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const normalizeAddressPayload = (values) => {
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
  };

  const validateAddressFields = (values) => {
    const errors = {};
    const hasStreet = Boolean(values.address);
    const hasCity = Boolean(values.city);
    const hasState = Boolean(values.state);
    const hasPostal = Boolean(values.postal_code);

    if ((hasCity || hasState || hasPostal) && !hasStreet) {
      errors.address =
        "Street address is required when city, state, or postal code is filled.";
    }

    if ((hasState || hasPostal) && !hasCity) {
      errors.city = "City is required when state or postal code is filled.";
    }

    if (hasState && !/^[A-Z]{2}$/.test(values.state)) {
      errors.state = "Use a 2-letter state code (e.g., CA).";
    }

    if (
      hasPostal &&
      !/^[0-9]{5}(-[0-9]{4})?$/.test(values.postal_code)
    ) {
      errors.postal_code = "Use ZIP or ZIP+4 (e.g., 94107 or 94107-1234).";
    }

    return errors;
  };

  const validateFulfillmentFields = (values) => {
    const errors = {};
    const defaultDeliveryFeeCents = dollarsInputToCents(values.default_delivery_fee);
    const deliveryMinOrderCents = dollarsInputToCents(values.delivery_min_order);
    const deliveryRadiusMiles = parseOptionalNonNegativeNumber(
      values.delivery_radius_miles
    );

    if (Number.isNaN(defaultDeliveryFeeCents)) {
      errors.default_delivery_fee = "Enter a valid amount with up to 2 decimals.";
    }

    if (Number.isNaN(deliveryMinOrderCents)) {
      errors.delivery_min_order = "Enter a valid amount with up to 2 decimals.";
    }

    if (Number.isNaN(deliveryRadiusMiles)) {
      errors.delivery_radius_miles = "Enter a valid non-negative number.";
    }

    return {
      errors,
      payload: {
        pickup_enabled_default: values.pickup_enabled_default !== false,
        local_delivery_enabled_default: values.local_delivery_enabled_default === true,
        default_delivery_fee_cents: Number.isNaN(defaultDeliveryFeeCents)
          ? null
          : defaultDeliveryFeeCents,
        delivery_radius_miles: Number.isNaN(deliveryRadiusMiles)
          ? null
          : deliveryRadiusMiles,
        delivery_min_order_cents: Number.isNaN(deliveryMinOrderCents)
          ? null
          : deliveryMinOrderCents,
        delivery_notes: String(values.delivery_notes || "").trim() || null,
      },
    };
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  /* -----------------------------------------------------------
     LOAD PROFILE INTO FORM
  ----------------------------------------------------------- */
  useEffect(() => {
    if (!supabase || !user?.id) return;
    let cancelled = false;

    (async () => {
      const business = await getBusinessByUserId({
        client: supabase,
        userId: user.id,
        selfHeal: false,
      });
      if (cancelled) return;
      if (!business) return;
      const nextForm = buildInitialForm(business);
      lastUserIdRef.current = user.id;
      setForm(nextForm);
      setInitialForm(nextForm);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, user?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    if (lastUserIdRef.current === profile.id) return;
    lastUserIdRef.current = profile.id;
    queueMicrotask(() => {
      const nextForm = buildInitialForm(profile);
      setForm(nextForm);
      setInitialForm(nextForm);
    });
  }, [profile]);

  useEffect(() => {
    if (loadingUser) return;
    if (!user) {
      router.replace(PATHS.public.businessLanding);
    }
  }, [loadingUser, router, user]);

  /* -----------------------------------------------------------
     SAVE CHANGES
  ----------------------------------------------------------- */
  async function handleSave() {
    if (!user) return;
    const normalizedAddress = normalizeAddressPayload(form);
    const validationErrors = validateAddressFields(normalizedAddress);
    const fulfillmentValidation = validateFulfillmentFields(form);
    const nextFieldErrors = {
      ...validationErrors,
      ...fulfillmentValidation.errors,
    };

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      showToast("error", "Fix the highlighted fields.");
      return;
    }

    setSaving(true);
    setFieldErrors({});

    const updates = {
      full_name: form.full_name,
      business_name: form.full_name,
      phone: form.phone,
      city: normalizedAddress.city || null,
      address: normalizedAddress.address || null,
      address_2: normalizedAddress.address_2 || null,
      state: normalizedAddress.state || null,
      postal_code: normalizedAddress.postal_code || null,
      website: form.website,
      profile_photo_url: form.profile_photo_url,
    };

    const { error: userUpdateError } = await supabase
      .from("users")
        .update(updates)
      .eq("id", user.id);

    let businessUpdateError = null;
    const businessesPayload = {
      owner_user_id: user.id,
      business_name: form.full_name || null,
      phone: form.phone || null,
      city: normalizedAddress.city || null,
      address: normalizedAddress.address || null,
      address_2: normalizedAddress.address_2 || null,
      state: normalizedAddress.state || null,
      postal_code: normalizedAddress.postal_code || null,
      website: form.website || null,
      profile_photo_url: form.profile_photo_url || null,
      pickup_enabled_default:
        fulfillmentValidation.payload.pickup_enabled_default,
      local_delivery_enabled_default:
        fulfillmentValidation.payload.local_delivery_enabled_default,
      default_delivery_fee_cents:
        fulfillmentValidation.payload.default_delivery_fee_cents,
      delivery_radius_miles: fulfillmentValidation.payload.delivery_radius_miles,
      delivery_min_order_cents:
        fulfillmentValidation.payload.delivery_min_order_cents,
      delivery_notes: fulfillmentValidation.payload.delivery_notes,
      is_internal: profile?.is_internal === true,
    };

    if (profile?.public_id) {
      businessesPayload.public_id = profile.public_id;
    }

    const businessResult = await supabase
      .from("businesses")
      .upsert(businessesPayload, { onConflict: "owner_user_id", ignoreDuplicates: false });

    if (businessResult.error) {
      const code = String(businessResult.error.code || "");
      const isSchemaMissing = code === "42P01" || code === "42703" || code === "PGRST204";
      if (!isSchemaMissing) {
        businessUpdateError = businessResult.error;
      }
    }

    setSaving(false);
    setActiveSection(null);

    if (!userUpdateError && !businessUpdateError) {
      refreshProfile();
      const nextForm = buildInitialForm({
        ...profile,
        business_name: form.full_name,
        full_name: form.full_name,
        phone: form.phone,
        city: normalizedAddress.city || null,
        address: normalizedAddress.address || null,
        address_2: normalizedAddress.address_2 || null,
        state: normalizedAddress.state || null,
        postal_code: normalizedAddress.postal_code || null,
        website: form.website,
        profile_photo_url: form.profile_photo_url,
        pickup_enabled_default:
          fulfillmentValidation.payload.pickup_enabled_default,
        local_delivery_enabled_default:
          fulfillmentValidation.payload.local_delivery_enabled_default,
        default_delivery_fee_cents:
          fulfillmentValidation.payload.default_delivery_fee_cents,
        delivery_radius_miles: fulfillmentValidation.payload.delivery_radius_miles,
        delivery_min_order_cents:
          fulfillmentValidation.payload.delivery_min_order_cents,
        delivery_notes: fulfillmentValidation.payload.delivery_notes,
      });
      setInitialForm(nextForm);
      showToast("success", "Settings updated.");
      return;
    }

    showToast(
      "error",
      userUpdateError?.message ||
        businessUpdateError?.message ||
        "Failed to save settings."
    );
  }

  /* -----------------------------------------------------------
     DELETE ACCOUNT
  ----------------------------------------------------------- */
  async function handleDeleteAccount() {
    if (!user) return;
    setDeleteConfirmText("");
    setDeleteModalOpen(true);
  }

  async function confirmDeleteAccount() {
    if (!user || deletePending) return;
    setDeletePending(true);
    try {
      const response = await fetch("/api/settings/request-account-deletion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmationText: deleteConfirmText,
          confirmationEmail: user.email || undefined,
          reason: "user_initiated",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to delete account.");
      }

      showToast("success", "Your account has been deleted.");
      setDeleteModalOpen(false);
      await logout({
        redirectTo: "/account-deleted",
        reason: "account_deletion_requested",
      });
    } catch (error) {
      showToast("error", error?.message || "Failed to delete account.");
    } finally {
      setDeletePending(false);
    }
  }

  /* -----------------------------------------------------------
     PHOTO UPLOAD
  ----------------------------------------------------------- */
  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoUploading(true);

    const fileName = `${user.id}-${Date.now()}`;

    const { error } = await supabase.storage
      .from("business-photos")
      .upload(fileName, file);

    if (!error) {
      supabase.storage.from("business-photos").getPublicUrl(fileName);
      const photoUrl = `business-photos/${fileName}`;

      const { error: userPhotoError } = await supabase
        .from("users")
        .update({ profile_photo_url: photoUrl })
        .eq("id", user.id);

      const { error: businessPhotoError } = await supabase
        .from("businesses")
        .update({ profile_photo_url: photoUrl })
        .eq("owner_user_id", user.id);

      if (userPhotoError) {
        showToast("error", userPhotoError.message || "Failed to save photo.");
        setPhotoUploading(false);
        return;
      }

      setForm((prev) => ({
        ...prev,
        profile_photo_url: photoUrl,
      }));
      refreshProfile?.();

      if (businessPhotoError) {
        showToast(
          "error",
          businessPhotoError.message || "Photo uploaded, but business sync failed."
        );
      } else {
        showToast("success", "Photo uploaded.");
      }
    } else {
      showToast("error", error.message || "Failed to upload photo.");
    }

    setPhotoUploading(false);
  }

  /* -----------------------------------------------------------
     CHANGE DETECTION
  ----------------------------------------------------------- */
  const hasChanges = JSON.stringify(form) !== JSON.stringify(initialForm);

  const primaryProvider = getPrimaryAuthProvider(user);
  const providerLabel = getAuthProviderLabel(user);
  const userEmail = user?.email || profile?.email || "";
  const providerName = primaryProvider
    ? primaryProvider === "email" || primaryProvider === "google"
      ? userEmail || "Email"
      : primaryProvider.charAt(0).toUpperCase() + primaryProvider.slice(1)
    : userEmail || "Email";
  const isEditingProfile = activeSection === "profile";
  const isEditingAddress = activeSection === "address";
  const isEditingFulfillment = activeSection === "fulfillment";
  const isEditingAnySection = activeSection !== null;

  /* -----------------------------------------------------------
     DEBUG (dev only) — trace provider sources
  ----------------------------------------------------------- */
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const storedLoginMethod = (() => {
      try {
        return localStorage.getItem("loginMethod");
      } catch {
        return null;
      }
    })();

    const storedProvider = (() => {
      try {
        return localStorage.getItem("provider");
      } catch {
        return null;
      }
    })();

    console.debug("[Settings:business] auth provider debug", {
      resolvedProvider: primaryProvider,
      providerLabel,
      sessionUserId: user?.id,
      sessionUserEmail: user?.email,
      app_metadata: user?.app_metadata,
      user_metadata: user?.user_metadata,
      profileProvider: {
        provider: profile?.provider,
        auth_provider: profile?.auth_provider,
        signup_method: profile?.signup_method,
      },
      storedLoginMethod,
      storedProvider,
    });
  }, [primaryProvider, profile, providerLabel, user]);

  /* -----------------------------------------------------------
     UI GUARD
  ----------------------------------------------------------- */
  if (loadingUser) {
    return <div className="min-h-screen bg-[#f6f7fb]" />;
  }

  if (!user) {
    return null;
  }

  /* -----------------------------------------------------------
     UI START
  ----------------------------------------------------------- */
  return (
    <div className="min-h-screen bg-[#f6f7fb] text-slate-900">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-600/80">
              Business account
            </p>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Settings
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                Manage your business profile, fulfillment defaults, and account access.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            {isEditingAnySection ? (
              <span>
                Editing{" "}
                <span className="font-semibold text-slate-900">
                  {activeSection
                    ? activeSection.charAt(0).toUpperCase() + activeSection.slice(1)
                    : ""}
                </span>
              </span>
            ) : (
              <span>Choose a section to update.</span>
            )}
          </div>
        </div>

        <div className="space-y-10">
          <SettingsSection
            title="Profile"
            description="Update the business details customers see across YourBarrio."
            action={
              <SectionActionButton
                onClick={() => beginSectionEdit("profile")}
                disabled={isEditingAnySection && !isEditingProfile}
              >
                {isEditingProfile ? "Editing" : "Edit"}
              </SectionActionButton>
            }
            footer={
              isEditingProfile ? (
                <>
                  <button
                    type="button"
                    onClick={cancelSectionEdit}
                    className={secondaryButtonClassName}
                  >
                    Cancel
                  </button>
                  <SectionSaveButton
                    onClick={handleSave}
                    disabled={!hasChanges || saving}
                  >
                    {saving ? "Saving..." : "Save changes"}
                  </SectionSaveButton>
                </>
              ) : null
            }
            className={sectionCardClassName}
            headerClassName={sectionHeaderClassName}
            bodyClassName={sectionBodyClassName}
            footerClassName={sectionFooterClassName}
            titleClassName={sectionTitleClassName}
            descriptionClassName={sectionDescriptionClassName}
          >
            <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                <div className="flex flex-col items-start gap-4">
                  <SafeAvatar
                    src={
                      form.profile_photo_url ||
                      profile?.profile_photo_url ||
                      ""
                    }
                    userMetadata={user?.user_metadata}
                    name={form.full_name || profile?.business_name || profile?.full_name}
                    displayName={form.full_name || profile?.full_name}
                    businessName={form.full_name || profile?.business_name}
                    email={userEmail}
                    alt="Business profile photo"
                    width={144}
                    height={144}
                    shape="rounded-square"
                    identityType="business"
                    className="h-28 w-28 overflow-hidden rounded-2xl border border-slate-200 bg-gray-100 object-cover shadow-sm ring-1 ring-black/5 sm:h-36 sm:w-36"
                    initialsClassName="text-3xl sm:text-4xl"
                  />
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-slate-900">
                      Business photo
                    </p>
                    <p className="text-xs leading-5 text-slate-500">
                      Used on your storefront and business profile.
                    </p>
                  </div>
                  {isEditingProfile ? (
                    <label className={`${secondaryButtonClassName} cursor-pointer`}>
                      {photoUploading ? "Uploading..." : "Change photo"}
                      <input
                        type="file"
                        className="hidden"
                        onChange={handlePhotoUpload}
                        disabled={photoUploading}
                      />
                    </label>
                  ) : null}
                </div>
              </div>

              <div className="space-y-5">
                <FieldGrid className="gap-5 sm:grid-cols-2">
                  <Field
                    label="Business name"
                    id="full_name"
                    labelClassName={fieldLabelClassName}
                    helperClassName={fieldHelperClassName}
                    errorClassName={fieldErrorClassName}
                  >
                    {isEditingProfile ? (
                      <input
                        id="full_name"
                        type="text"
                        value={form.full_name}
                        onChange={(e) =>
                          handleFieldChange("full_name", e.target.value)
                        }
                        className={businessInputClassName}
                      />
                    ) : (
                      <ReadOnlyField value={form.full_name} />
                    )}
                  </Field>

                  <Field
                    label="Phone number"
                    id="phone"
                    labelClassName={fieldLabelClassName}
                    helperClassName={fieldHelperClassName}
                    errorClassName={fieldErrorClassName}
                  >
                    {isEditingProfile ? (
                      <input
                        id="phone"
                        type="tel"
                        value={form.phone}
                        onChange={(e) =>
                          handleFieldChange("phone", e.target.value)
                        }
                        className={businessInputClassName}
                      />
                    ) : (
                      <ReadOnlyField value={form.phone} />
                    )}
                  </Field>
                </FieldGrid>

                <Field
                  label="Website"
                  id="website"
                  helper="Optional, for your external site or ordering page."
                  labelClassName={fieldLabelClassName}
                  helperClassName={fieldHelperClassName}
                  errorClassName={fieldErrorClassName}
                >
                  {isEditingProfile ? (
                    <input
                      id="website"
                      type="url"
                      value={form.website}
                      onChange={(e) =>
                        handleFieldChange("website", e.target.value)
                      }
                      className={businessInputClassName}
                    />
                  ) : (
                    <ReadOnlyField value={form.website} />
                  )}
                </Field>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Address"
            description="Keep your storefront address accurate so customers can find you easily."
            action={
              <SectionActionButton
                onClick={() => beginSectionEdit("address")}
                disabled={isEditingAnySection && !isEditingAddress}
              >
                {isEditingAddress ? "Editing" : "Edit"}
              </SectionActionButton>
            }
            footer={
              isEditingAddress ? (
                <>
                  <button
                    type="button"
                    onClick={cancelSectionEdit}
                    className={secondaryButtonClassName}
                  >
                    Cancel
                  </button>
                  <SectionSaveButton
                    onClick={handleSave}
                    disabled={!hasChanges || saving}
                  >
                    {saving ? "Saving..." : "Save changes"}
                  </SectionSaveButton>
                </>
              ) : null
            }
            className={sectionCardClassName}
            headerClassName={sectionHeaderClassName}
            bodyClassName={sectionBodyClassName}
            footerClassName={sectionFooterClassName}
            titleClassName={sectionTitleClassName}
            descriptionClassName={sectionDescriptionClassName}
          >
            <FieldGrid className="gap-5 sm:grid-cols-2">
              <Field
                label="Street address"
                id="address"
                helper="Required if city, state, or ZIP is set."
                error={fieldErrors.address}
                labelClassName={fieldLabelClassName}
                helperClassName={fieldHelperClassName}
                errorClassName={fieldErrorClassName}
              >
                {isEditingAddress ? (
                  <input
                    id="address"
                    type="text"
                    value={form.address}
                    onChange={(e) =>
                      handleFieldChange("address", e.target.value)
                    }
                    placeholder="123 Pine St"
                    className={`${businessInputClassName} ${
                      fieldErrors.address
                        ? "border-rose-400 focus-visible:border-rose-500 focus-visible:ring-rose-500/15"
                        : ""
                    }`}
                    aria-invalid={Boolean(fieldErrors.address)}
                  />
                ) : (
                  <ReadOnlyField value={form.address} />
                )}
              </Field>

              <Field
                label="Apt / Suite / Unit"
                id="address_2"
                helper="Optional, for multi-tenant buildings or suites."
                labelClassName={fieldLabelClassName}
                helperClassName={fieldHelperClassName}
                errorClassName={fieldErrorClassName}
              >
                {isEditingAddress ? (
                  <input
                    id="address_2"
                    type="text"
                    value={form.address_2}
                    onChange={(e) =>
                      handleFieldChange("address_2", e.target.value)
                    }
                    placeholder="Suite 210"
                    className={businessInputClassName}
                  />
                ) : (
                  <ReadOnlyField value={form.address_2} />
                )}
              </Field>
            </FieldGrid>

            <FieldGrid className="gap-5 sm:grid-cols-3">
              <Field
                label="City"
                id="city"
                helper="Required if state or ZIP is set."
                error={fieldErrors.city}
                labelClassName={fieldLabelClassName}
                helperClassName={fieldHelperClassName}
                errorClassName={fieldErrorClassName}
              >
                {isEditingAddress ? (
                  <input
                    id="city"
                    type="text"
                    value={form.city}
                    onChange={(e) => handleFieldChange("city", e.target.value)}
                    placeholder="Long Beach"
                    className={`${businessInputClassName} ${
                      fieldErrors.city
                        ? "border-rose-400 focus-visible:border-rose-500 focus-visible:ring-rose-500/15"
                        : ""
                    }`}
                    aria-invalid={Boolean(fieldErrors.city)}
                  />
                ) : (
                  <ReadOnlyField value={form.city} />
                )}
              </Field>

              <Field
                label="State"
                id="state"
                helper="Select your state."
                error={fieldErrors.state}
                labelClassName={fieldLabelClassName}
                helperClassName={fieldHelperClassName}
                errorClassName={fieldErrorClassName}
              >
                {isEditingAddress ? (
                  <select
                    id="state"
                    value={form.state}
                    onChange={(e) => handleFieldChange("state", e.target.value)}
                    className={`${businessInputClassName} ${
                      fieldErrors.state
                        ? "border-rose-400 focus-visible:border-rose-500 focus-visible:ring-rose-500/15"
                        : ""
                    }`}
                    aria-invalid={Boolean(fieldErrors.state)}
                  >
                    <option value="">Select state</option>
                    {US_STATES.map((stateOption) => (
                      <option key={stateOption.code} value={stateOption.code}>
                        {stateOption.code} - {stateOption.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <ReadOnlyField value={form.state} />
                )}
              </Field>

              <Field
                label="Postal code"
                id="postal_code"
                helper="ZIP or ZIP+4 format."
                error={fieldErrors.postal_code}
                labelClassName={fieldLabelClassName}
                helperClassName={fieldHelperClassName}
                errorClassName={fieldErrorClassName}
              >
                {isEditingAddress ? (
                  <input
                    id="postal_code"
                    type="text"
                    value={form.postal_code}
                    onChange={(e) =>
                      handleFieldChange("postal_code", e.target.value)
                    }
                    placeholder="90802"
                    className={`${businessInputClassName} ${
                      fieldErrors.postal_code
                        ? "border-rose-400 focus-visible:border-rose-500 focus-visible:ring-rose-500/15"
                        : ""
                    }`}
                    aria-invalid={Boolean(fieldErrors.postal_code)}
                  />
                ) : (
                  <ReadOnlyField value={form.postal_code} />
                )}
              </Field>
            </FieldGrid>
          </SettingsSection>

          <SettingsSection
            title="Fulfillment"
            description="Set the default pickup and delivery options new listings should inherit."
            action={
              <SectionActionButton
                onClick={() => beginSectionEdit("fulfillment")}
                disabled={isEditingAnySection && !isEditingFulfillment}
              >
                {isEditingFulfillment ? "Editing" : "Edit"}
              </SectionActionButton>
            }
            footer={
              isEditingFulfillment ? (
                <>
                  <button
                    type="button"
                    onClick={cancelSectionEdit}
                    className={secondaryButtonClassName}
                  >
                    Cancel
                  </button>
                  <SectionSaveButton
                    onClick={handleSave}
                    disabled={!hasChanges || saving}
                  >
                    {saving ? "Saving..." : "Save changes"}
                  </SectionSaveButton>
                </>
              ) : null
            }
            className={sectionCardClassName}
            headerClassName={sectionHeaderClassName}
            bodyClassName={sectionBodyClassName}
            footerClassName={sectionFooterClassName}
            titleClassName={sectionTitleClassName}
            descriptionClassName={sectionDescriptionClassName}
          >
            <FieldGrid className="gap-4 sm:grid-cols-2">
              {isEditingFulfillment ? (
                <>
                  <ToggleField
                    id="pickup_enabled_default"
                    checked={form.pickup_enabled_default}
                    onChange={(e) =>
                      handleFieldChange("pickup_enabled_default", e.target.checked)
                    }
                    label="Pickup enabled by default"
                    helper="New listings start with pickup available."
                  />
                  <ToggleField
                    id="local_delivery_enabled_default"
                    checked={form.local_delivery_enabled_default}
                    onChange={(e) =>
                      handleFieldChange(
                        "local_delivery_enabled_default",
                        e.target.checked
                      )
                    }
                    label="Local delivery enabled"
                    helper="Allow new listings to offer delivery when you have delivery settings configured."
                  />
                </>
              ) : (
                <>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-900">
                      Pickup enabled by default
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {form.pickup_enabled_default ? "Enabled" : "Disabled"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-900">
                      Local delivery enabled
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {form.local_delivery_enabled_default ? "Enabled" : "Disabled"}
                    </p>
                  </div>
                </>
              )}
            </FieldGrid>

            <div className="rounded-3xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-slate-900">
                  Delivery defaults
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  These values are used as the starting point for delivery-enabled listings.
                </p>
              </div>

              <FieldGrid className="gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <Field
                  label="Default delivery fee"
                  id="default_delivery_fee"
                  helper="Shown at checkout when delivery is selected."
                  error={fieldErrors.default_delivery_fee}
                  labelClassName={fieldLabelClassName}
                  helperClassName={fieldHelperClassName}
                  errorClassName={fieldErrorClassName}
                >
                  {isEditingFulfillment ? (
                    <input
                      id="default_delivery_fee"
                      type="text"
                      inputMode="decimal"
                      value={form.default_delivery_fee}
                      onChange={(e) =>
                        handleFieldChange("default_delivery_fee", e.target.value)
                      }
                      placeholder="5.00"
                      className={`${businessInputClassName} ${
                        fieldErrors.default_delivery_fee
                          ? "border-rose-400 focus-visible:border-rose-500 focus-visible:ring-rose-500/15"
                          : ""
                      }`}
                      aria-invalid={Boolean(fieldErrors.default_delivery_fee)}
                    />
                  ) : (
                    <ReadOnlyField
                      value={
                        form.default_delivery_fee
                          ? `$${form.default_delivery_fee}`
                          : ""
                      }
                    />
                  )}
                </Field>

                <Field
                  label="Delivery radius (miles)"
                  id="delivery_radius_miles"
                  helper="Optional service area reference."
                  error={fieldErrors.delivery_radius_miles}
                  labelClassName={fieldLabelClassName}
                  helperClassName={fieldHelperClassName}
                  errorClassName={fieldErrorClassName}
                >
                  {isEditingFulfillment ? (
                    <input
                      id="delivery_radius_miles"
                      type="text"
                      inputMode="decimal"
                      value={form.delivery_radius_miles}
                      onChange={(e) =>
                        handleFieldChange("delivery_radius_miles", e.target.value)
                      }
                      placeholder="5"
                      className={`${businessInputClassName} ${
                        fieldErrors.delivery_radius_miles
                          ? "border-rose-400 focus-visible:border-rose-500 focus-visible:ring-rose-500/15"
                          : ""
                      }`}
                      aria-invalid={Boolean(fieldErrors.delivery_radius_miles)}
                    />
                  ) : (
                    <ReadOnlyField value={form.delivery_radius_miles} />
                  )}
                </Field>

                <Field
                  label="Minimum order for delivery"
                  id="delivery_min_order"
                  helper="Optional order threshold."
                  error={fieldErrors.delivery_min_order}
                  labelClassName={fieldLabelClassName}
                  helperClassName={fieldHelperClassName}
                  errorClassName={fieldErrorClassName}
                >
                  {isEditingFulfillment ? (
                    <input
                      id="delivery_min_order"
                      type="text"
                      inputMode="decimal"
                      value={form.delivery_min_order}
                      onChange={(e) =>
                        handleFieldChange("delivery_min_order", e.target.value)
                      }
                      placeholder="20.00"
                      className={`${businessInputClassName} ${
                        fieldErrors.delivery_min_order
                          ? "border-rose-400 focus-visible:border-rose-500 focus-visible:ring-rose-500/15"
                          : ""
                      }`}
                      aria-invalid={Boolean(fieldErrors.delivery_min_order)}
                    />
                  ) : (
                    <ReadOnlyField
                      value={
                        form.delivery_min_order ? `$${form.delivery_min_order}` : ""
                      }
                    />
                  )}
                </Field>
              </FieldGrid>

              <div className="mt-5">
                <Field
                  label="Delivery notes"
                  id="delivery_notes"
                  helper="Helpful checkout guidance for local delivery."
                  labelClassName={fieldLabelClassName}
                  helperClassName={fieldHelperClassName}
                  errorClassName={fieldErrorClassName}
                >
                  {isEditingFulfillment ? (
                    <textarea
                      id="delivery_notes"
                      rows={4}
                      value={form.delivery_notes}
                      onChange={(e) =>
                        handleFieldChange("delivery_notes", e.target.value)
                      }
                      placeholder="Leave at side entrance if the front door is closed."
                      className={businessTextareaClassName}
                    />
                  ) : (
                    <ReadOnlyField value={form.delivery_notes} multiline />
                  )}
                </Field>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Security"
            description="Manage how you access your account."
            className={sectionCardClassName}
            headerClassName={sectionHeaderClassName}
            bodyClassName={sectionBodyClassName}
            titleClassName={sectionTitleClassName}
            descriptionClassName={sectionDescriptionClassName}
          >
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  Password & login
                </p>
                <p className="text-sm text-slate-600">
                  Signed in via {providerLabel}
                  {providerName ? ` · ${providerName}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManagePasswordOpen(true)}
                className={secondaryButtonClassName}
              >
                Manage
              </button>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Delete account"
            description="This permanently removes your access to YourBarrio and starts account deletion."
            className="rounded-[28px] border border-rose-200 bg-white px-5 py-5 shadow-[0_12px_36px_rgba(15,23,42,0.04)] sm:px-7 sm:py-6"
            headerClassName={sectionHeaderClassName}
            bodyClassName={sectionBodyClassName}
            titleClassName="text-[1.05rem] font-semibold text-rose-700"
            descriptionClassName="mt-1 max-w-2xl text-sm leading-6 text-slate-500"
          >
            <div className="flex flex-col gap-4 rounded-2xl border border-rose-100 bg-rose-50/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                This action cannot be undone. Use it only if you want to permanently delete this business account.
              </p>
              <button
                type="button"
                onClick={handleDeleteAccount}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-500/15"
              >
                Delete account
              </button>
            </div>
          </SettingsSection>
        </div>
      </div>

      {toast ? (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className={`rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${
              toast.type === "success"
                ? "bg-emerald-500 text-white"
                : "bg-rose-500 text-white"
            }`}
          >
            {toast.message}
          </div>
        </div>
      ) : null}

      <ManagePasswordDialog
        open={managePasswordOpen}
        onClose={() => setManagePasswordOpen(false)}
        supabase={supabase}
        user={user}
        onSuccess={(message) => showToast("success", message)}
      />

      {deleteModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title-business"
        >
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 text-gray-900 shadow-xl transition-all duration-150 ease-out">
            <h2 id="delete-account-title-business" className="text-xl font-semibold text-gray-900">
              Delete account permanently?
            </h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              This action is permanent and cannot be undone. Once you delete your account, you will immediately lose access to YourBarrio.
            </p>
            <p className="mt-3 text-sm font-medium text-red-600">This action cannot be undone.</p>
            <label className="mt-5 block text-sm font-medium text-gray-800">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm.
              <input
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus-visible:border-red-500 focus-visible:ring-2 focus-visible:ring-red-500/30"
                autoComplete="off"
              />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={deletePending}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/60 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteAccount}
                disabled={deletePending || deleteConfirmText.trim().toUpperCase() !== "DELETE"}
                className="rounded-xl border border-red-600 bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70 disabled:opacity-50"
              >
                {deletePending ? "Deleting..." : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
