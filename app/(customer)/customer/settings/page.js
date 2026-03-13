"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import FastImage from "@/components/FastImage";
import { useRouter } from "next/navigation";
import {
  getAuthProviderLabel,
  getPrimaryAuthProvider,
} from "@/lib/getAuthProvider";
import {
  Field,
  FieldGrid,
  SettingsSection,
  inputClassName,
} from "@/components/settings/SettingsSection";
import ManagePasswordDialog from "@/components/settings/ManagePasswordDialog";

export default function SettingsPage() {
  const { user, profile, supabase, loadingUser, logout, refreshProfile } =
    useAuth();
  const router = useRouter();
  const effectiveProfile = useMemo(
    () =>
      profile ||
      (user
        ? {
            id: user.id,
            email: user.email || null,
            full_name: user.user_metadata?.full_name || null,
            profile_photo_url: user.user_metadata?.avatar_url || null,
            phone: null,
            city: null,
            address: null,
            address_2: null,
            state: null,
            postal_code: null,
          }
        : null),
    [profile, user]
  );

  /* -----------------------------------------------------------
     HOOKS (always first — no conditional hooks)
  ----------------------------------------------------------- */
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [toast, setToast] = useState(null);
  const [managePasswordOpen, setManagePasswordOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const toastTimerRef = useRef(null);

  const buildInitialForm = (userValue) => ({
    full_name: userValue?.full_name || "",
    phone: userValue?.phone || "",
    city: userValue?.city || "",
    address: userValue?.address || "",
    address_2: userValue?.address_2 || "",
    state: userValue?.state ? userValue.state.toUpperCase() : "",
    postal_code: userValue?.postal_code || "",
    profile_photo_url: userValue?.profile_photo_url || "",
  });

  const [form, setForm] = useState(() => buildInitialForm(effectiveProfile));
  const lastUserIdRef = useRef(null);

  const showToast = (type, message) => {
    setToast({ type, message });
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 3500);
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
    const stateValue = trimValue(values.state).toUpperCase();
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

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  /* -----------------------------------------------------------
     LOAD PROFILE INTO FORM
  ----------------------------------------------------------- */
  useEffect(() => {
    if (!effectiveProfile?.id) return;
    if (lastUserIdRef.current === effectiveProfile.id) return;
    lastUserIdRef.current = effectiveProfile.id;
    queueMicrotask(() => {
      setForm(buildInitialForm(effectiveProfile));
    });
  }, [effectiveProfile]);

  useEffect(() => {
    if (loadingUser) return;
    if (!user) {
      router.replace("/");
    }
  }, [loadingUser, router, user]);

  /* -----------------------------------------------------------
     SAVE CHANGES
  ----------------------------------------------------------- */
  async function handleSave() {
    if (!user) return;
    const normalizedAddress = normalizeAddressPayload(form);
    const validationErrors = validateAddressFields(normalizedAddress);

    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      showToast("error", "Fix the highlighted address fields.");
      return;
    }

    setSaving(true);
    setFieldErrors({});

    const { error } = await supabase
      .from("users")
      .update({
        full_name: form.full_name,
        phone: form.phone,
        city: normalizedAddress.city || null,
        address: normalizedAddress.address || null,
        address_2: normalizedAddress.address_2 || null,
        state: normalizedAddress.state || null,
        postal_code: normalizedAddress.postal_code || null,
        profile_photo_url: form.profile_photo_url,
      })
      .eq("id", user.id);

    setSaving(false);
    setEditMode(false);

    if (!error) {
      refreshProfile();
      showToast("success", "Settings updated.");
      return;
    }

    showToast("error", error.message || "Failed to save settings.");
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
      .from("avatars")
      .upload(fileName, file);

    if (!error) {
      supabase.storage.from("avatars").getPublicUrl(fileName);

      setForm((prev) => ({
        ...prev,
        profile_photo_url: `avatars/${fileName}`,
      }));
    }

    setPhotoUploading(false);
  }

  /* -----------------------------------------------------------
     CHANGE DETECTION
  ----------------------------------------------------------- */
  const hasChanges =
    effectiveProfile &&
    JSON.stringify(form) !==
      JSON.stringify(buildInitialForm(effectiveProfile));

  const primaryProvider = getPrimaryAuthProvider(user);
  const providerLabel = getAuthProviderLabel(user);
  const userEmail = user?.email || profile?.email || "";
  const providerName = primaryProvider
    ? primaryProvider === "email" || primaryProvider === "google"
      ? userEmail || "Email"
      : primaryProvider.charAt(0).toUpperCase() + primaryProvider.slice(1)
    : userEmail || "Email";

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

    console.debug("[Settings:customer] auth provider debug", {
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
    return (
      <div className="min-h-screen bg-[var(--yb-bg)] text-[var(--yb-text)] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-12 w-12 rounded-full border-4 border-[var(--yb-border)] border-t-slate-500 animate-spin mx-auto" />
          <p className="text-lg text-[var(--yb-text-muted)]">Loading your account...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  /* -----------------------------------------------------------
     UI START
  ----------------------------------------------------------- */
  return (
    <div className="min-h-screen text-white relative">
      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[#05010d]" />
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/40 via-fuchsia-900/30 to-black" />
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Settings
            </h1>
            <p className="text-sm text-white/60 sm:text-base">
              Manage your profile, address, and preferences.
            </p>
          </div>
          {!editMode ? (
            <button
              onClick={() => {
                setEditMode(true);
                setFieldErrors({});
              }}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-white/20 bg-white/10 px-5 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Edit profile
            </button>
          ) : null}
        </div>

        <div className="space-y-8">
          <SettingsSection
            title="Profile"
            description="Keep your personal details accurate for receipts and support."
          >
            <div className="flex flex-col gap-6 md:flex-row md:items-start">
              <div className="flex flex-col items-center gap-3 md:items-start">
                <FastImage
                  src={
                    form?.profile_photo_url ||
                    effectiveProfile?.profile_photo_url ||
                    "/customer-placeholder.png"
                  }
                  alt="Profile Photo"
                  width={132}
                  height={132}
                  className="h-[132px] w-[132px] rounded-2xl border border-white/15 object-cover"
                  sizes="132px"
                  priority
                />
                {editMode ? (
                  <label className="cursor-pointer text-sm font-medium text-pink-300 hover:text-pink-200">
                    Change photo
                    <input
                      type="file"
                      className="hidden"
                      onChange={handlePhotoUpload}
                    />
                  </label>
                ) : null}
              </div>

              <div className="flex-1 space-y-5">
                <FieldGrid className="sm:grid-cols-2">
                  <Field label="Full name" id="full_name">
                    {editMode ? (
                      <input
                        id="full_name"
                        type="text"
                        value={form.full_name}
                        onChange={(e) =>
                          handleFieldChange("full_name", e.target.value)
                        }
                        className={inputClassName}
                      />
                    ) : (
                      <div className="flex h-11 items-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white/80">
                        {form.full_name || "—"}
                      </div>
                    )}
                  </Field>

                  <Field label="Phone number" id="phone">
                    {editMode ? (
                      <input
                        id="phone"
                        type="tel"
                        value={form.phone}
                        onChange={(e) =>
                          handleFieldChange("phone", e.target.value)
                        }
                        className={inputClassName}
                      />
                    ) : (
                      <div className="flex h-11 items-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white/80">
                        {form.phone || "—"}
                      </div>
                    )}
                  </Field>
                </FieldGrid>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Address"
            description="This helps personalize delivery and nearby recommendations."
            footer={
              editMode ? (
                <>
                  <button
                    onClick={handleSave}
                    disabled={!hasChanges || saving}
                    className={`inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold transition ${
                      hasChanges
                        ? "bg-white text-black hover:bg-gray-200"
                        : "cursor-not-allowed bg-white/20 text-white/40"
                    }`}
                  >
                    {saving ? "Saving..." : "Save changes"}
                  </button>
                  <button
                    onClick={() => {
                      setEditMode(false);
                      setForm(buildInitialForm(effectiveProfile));
                      setFieldErrors({});
                    }}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-white/20 bg-white/5 px-5 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    Cancel
                  </button>
                </>
              ) : null
            }
          >
            <FieldGrid className="sm:grid-cols-2">
              <Field
                label="Street address"
                id="address"
                helper="Required if city, state, or ZIP is set."
                error={fieldErrors.address}
              >
                {editMode ? (
                  <input
                    id="address"
                    type="text"
                    value={form.address}
                    onChange={(e) =>
                      handleFieldChange("address", e.target.value)
                    }
                    placeholder="123 Pine St"
                    className={`${inputClassName} ${
                      fieldErrors.address
                        ? "border-rose-400 focus-visible:ring-rose-400/60"
                        : ""
                    }`}
                    aria-invalid={Boolean(fieldErrors.address)}
                  />
                ) : (
                  <div className="flex h-11 items-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white/80">
                    {form.address || "—"}
                  </div>
                )}
              </Field>

              <Field
                label="Apt / Suite / Unit"
                id="address_2"
                helper="Optional, but helps couriers find you faster."
              >
                {editMode ? (
                  <input
                    id="address_2"
                    type="text"
                    value={form.address_2}
                    onChange={(e) =>
                      handleFieldChange("address_2", e.target.value)
                    }
                    placeholder="Apt 4B"
                    className={inputClassName}
                  />
                ) : (
                  <div className="flex h-11 items-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white/80">
                    {form.address_2 || "—"}
                  </div>
                )}
              </Field>
            </FieldGrid>

            <FieldGrid className="sm:grid-cols-3">
              <Field
                label="City"
                id="city"
                helper="Required if state or ZIP is set."
                error={fieldErrors.city}
              >
                {editMode ? (
                  <input
                    id="city"
                    type="text"
                    value={form.city}
                    onChange={(e) => handleFieldChange("city", e.target.value)}
                    placeholder="Long Beach"
                    className={`${inputClassName} ${
                      fieldErrors.city
                        ? "border-rose-400 focus-visible:ring-rose-400/60"
                        : ""
                    }`}
                    aria-invalid={Boolean(fieldErrors.city)}
                  />
                ) : (
                  <div className="flex h-11 items-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white/80">
                    {form.city || "—"}
                  </div>
                )}
              </Field>

              <Field
                label="State"
                id="state"
                helper="Two-letter code."
                error={fieldErrors.state}
              >
                {editMode ? (
                  <input
                    id="state"
                    type="text"
                    value={form.state}
                    onChange={(e) =>
                      handleFieldChange(
                        "state",
                        e.target.value.toUpperCase()
                      )
                    }
                    placeholder="CA"
                    maxLength={2}
                    className={`${inputClassName} ${
                      fieldErrors.state
                        ? "border-rose-400 focus-visible:ring-rose-400/60"
                        : ""
                    }`}
                    aria-invalid={Boolean(fieldErrors.state)}
                  />
                ) : (
                  <div className="flex h-11 items-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white/80">
                    {form.state || "—"}
                  </div>
                )}
              </Field>

              <Field
                label="Postal code"
                id="postal_code"
                helper="ZIP or ZIP+4 format."
                error={fieldErrors.postal_code}
              >
                {editMode ? (
                  <input
                    id="postal_code"
                    type="text"
                    value={form.postal_code}
                    onChange={(e) =>
                      handleFieldChange("postal_code", e.target.value)
                    }
                    placeholder="90802"
                    className={`${inputClassName} ${
                      fieldErrors.postal_code
                        ? "border-rose-400 focus-visible:ring-rose-400/60"
                        : ""
                    }`}
                    aria-invalid={Boolean(fieldErrors.postal_code)}
                  />
                ) : (
                  <div className="flex h-11 items-center rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white/80">
                    {form.postal_code || "—"}
                  </div>
                )}
              </Field>
            </FieldGrid>
          </SettingsSection>

          <SettingsSection
            title="Security"
            description="Manage how you access your account."
          >
            <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-white">
                  Password & login
                </p>
                <p className="text-sm text-white/60">
                  Signed in via {providerLabel}
                  {providerName ? ` · ${providerName}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManagePasswordOpen(true)}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                Manage
              </button>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Delete account"
            description="This action is permanent and cannot be undone. Deleting your account will permanently remove your access to YourBarrio and delete your account in accordance with our policies."
          >
            <button
              onClick={handleDeleteAccount}
              className="inline-flex items-center text-sm font-semibold text-rose-300 hover:text-rose-200"
            >
              Delete account
            </button>
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
          aria-labelledby="delete-account-title-customer"
        >
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 text-gray-900 shadow-xl transition-all duration-150 ease-out">
            <h2 id="delete-account-title-customer" className="text-xl font-semibold text-gray-900">
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
