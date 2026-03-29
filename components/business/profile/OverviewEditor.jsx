"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { getBusinessTypeOptions } from "@/lib/taxonomy/businessTypes";
import {
  buildBusinessTaxonomyPayload,
  getBusinessTypeLabel,
  getBusinessTypeSlug,
} from "@/lib/taxonomy/compat";

const DESCRIPTION_MIN = 30;
const BUSINESS_TYPE_OPTIONS = getBusinessTypeOptions();

const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

// Generate time options from 12:00 AM to 11:30 PM in 30-min increments
const TIME_OPTIONS = (() => {
  const options = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hour24 = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const ampm = h < 12 ? "AM" : "PM";
      const minuteStr = m === 0 ? "" : `:${String(m).padStart(2, "0")}`;
      const label = `${hour12}${minuteStr} ${ampm}`;
      options.push({ value: hour24, label });
    }
  }
  return options;
})();

// Parse legacy string hours like "9am - 5pm" into structured format
function parseLegacyHours(value) {
  if (!value || typeof value !== "string") return null;
  // Match patterns like "9am - 5pm", "9:00 AM - 5:00 PM", "09:00 - 17:00"
  const timeRegex = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;
  const matches = [...value.matchAll(timeRegex)];
  if (matches.length >= 2) {
    const parseTime = (match) => {
      let hour = parseInt(match[1], 10);
      const minute = match[2] ? parseInt(match[2], 10) : 0;
      const period = match[3]?.toLowerCase();
      if (period === "pm" && hour < 12) hour += 12;
      if (period === "am" && hour === 12) hour = 0;
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    };
    return { open: parseTime(matches[0]), close: parseTime(matches[1]) };
  }
  return null;
}

// Normalize hours data to new structured format
function normalizeHours(hoursObj) {
  if (!hoursObj) return {};
  const normalized = {};
  DAYS.forEach(({ key }) => {
    const val = hoursObj[key];
    if (!val) {
      normalized[key] = { open: "", close: "", isClosed: false };
    } else if (typeof val === "string") {
      if (val.toLowerCase() === "closed") {
        normalized[key] = { open: "", close: "", isClosed: true };
      } else {
        const parsed = parseLegacyHours(val);
        normalized[key] = parsed
          ? { ...parsed, isClosed: false }
          : { open: "", close: "", isClosed: false };
      }
    } else if (typeof val === "object") {
      normalized[key] = {
        open: val.open || "",
        close: val.close || "",
        isClosed: Boolean(val.isClosed),
      };
    } else {
      normalized[key] = { open: "", close: "", isClosed: false };
    }
  });
  return normalized;
}

function formatTime24(value) {
  if (!value) return "";
  const [hourStr, minuteStr = "00"] = value.split(":");
  const hourNum = Number(hourStr);
  if (Number.isNaN(hourNum)) return value;
  const hour12 = hourNum % 12 || 12;
  const ampm = hourNum < 12 ? "AM" : "PM";
  const minute = minuteStr.padStart(2, "0");
  return `${hour12}:${minute} ${ampm}`;
}

function formatHoursRange(dayData) {
  if (!dayData) return "—";
  if (dayData.isClosed) return "Closed";
  if (dayData.open && dayData.close) {
    return `${formatTime24(dayData.open)} - ${formatTime24(dayData.close)}`;
  }
  return "—";
}

const SOCIAL_FIELDS = [
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/" },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/company/" },
  { key: "x", label: "X (Twitter)", placeholder: "https://x.com/" },
];

function toObject(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function filterPayloadByProfile(payload, profile) {
  if (!profile) return {};
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) =>
      Object.prototype.hasOwnProperty.call(profile, key)
    )
  );
}

export default function OverviewEditor({
  profile,
  tone,
  editMode,
  setEditMode,
  onProfileUpdate,
  onToast,
}) {
  const { supabase, user, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [isDirty, setIsDirty] = useState(false);
  const [savingMessage, setSavingMessage] = useState("");

  const [form, setForm] = useState({
    business_name: "",
    business_type: "",
    description: "",
    website: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    hours: {},
    socials: {},
    profile_photo_url: "",
    cover_photo_url: "",
  });

  useEffect(() => {
    if (!profile) return;
    const hours = normalizeHours(toObject(profile.hours_json));
    const socials = toObject(profile.social_links_json);
    setForm({
      business_name: profile.business_name || profile.full_name || "",
      business_type: getBusinessTypeSlug(profile, ""),
      description: profile.description || "",
      website: profile.website || "",
      phone: profile.phone || "",
      email: profile.email || "",
      address: profile.address || "",
      city: profile.city || "",
      hours,
      socials,
      profile_photo_url: profile.profile_photo_url || "",
      cover_photo_url: profile.cover_photo_url || "",
    });
    setIsDirty(false);
  }, [profile]);

  const hasChanges = useMemo(() => {
    if (!profile) return false;
    const hours = normalizeHours(toObject(profile.hours_json));
    const socials = toObject(profile.social_links_json);
    const comparison = {
      business_name: profile.business_name || profile.full_name || "",
      business_type: getBusinessTypeSlug(profile, ""),
      description: profile.description || "",
      website: profile.website || "",
      phone: profile.phone || "",
      email: profile.email || "",
      address: profile.address || "",
      city: profile.city || "",
      hours,
      socials,
      profile_photo_url: profile.profile_photo_url || "",
      cover_photo_url: profile.cover_photo_url || "",
    };
    return JSON.stringify(comparison) !== JSON.stringify(form);
  }, [profile, form]);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    setIsDirty(true);
  };

  const handleHourChange = (dayKey, field) => (event) => {
    const value = field === "isClosed" ? event.target.checked : event.target.value;
    setForm((prev) => ({
      ...prev,
      hours: {
        ...prev.hours,
        [dayKey]: { ...prev.hours[dayKey], [field]: value },
      },
    }));
    setIsDirty(true);
  };

  const copyHoursToWeekdays = (sourceDay) => {
    const weekdays = ["mon", "tue", "wed", "thu", "fri"];
    const sourceHours = form.hours[sourceDay];
    setForm((prev) => {
      const newHours = { ...prev.hours };
      weekdays.forEach((day) => {
        newHours[day] = { ...sourceHours };
      });
      return { ...prev, hours: newHours };
    });
    setIsDirty(true);
  };

  const copyHoursToAllDays = (sourceDay) => {
    const sourceHours = form.hours[sourceDay];
    setForm((prev) => {
      const newHours = {};
      DAYS.forEach(({ key }) => {
        newHours[key] = { ...sourceHours };
      });
      return { ...prev, hours: newHours };
    });
    setIsDirty(true);
  };

  const handleSocialChange = (key) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({
      ...prev,
      socials: { ...prev.socials, [key]: value },
    }));
    setIsDirty(true);
  };

  const buildHoursPayload = () => {
    const entries = {};
    DAYS.forEach(({ key }) => {
      const dayData = form.hours?.[key];
      if (!dayData) return;
      if (dayData.isClosed) {
        entries[key] = { open: "", close: "", isClosed: true };
      } else if (dayData.open && dayData.close) {
        entries[key] = { open: dayData.open, close: dayData.close, isClosed: false };
      }
    });
    return Object.keys(entries).length ? entries : null;
  };

  const buildSocialsPayload = () => {
    const entries = {};
    SOCIAL_FIELDS.forEach(({ key }) => {
      const value = form.socials?.[key];
      if (value && value.trim()) {
        entries[key] = value.trim();
      }
    });
    return Object.keys(entries).length ? entries : null;
  };

  const validateForm = () => {
    const nextErrors = {};
    if (!form.business_name.trim()) nextErrors.business_name = "Business name is required.";
    if (!form.business_type.trim()) nextErrors.business_type = "Business type is required.";
    if (!form.city.trim()) nextErrors.city = "City is required.";
    if (!form.description.trim() || form.description.trim().length < DESCRIPTION_MIN) {
      nextErrors.description = `Description must be at least ${DESCRIPTION_MIN} characters.`;
    }

    setErrors(nextErrors);
    return {
      isValid: Object.keys(nextErrors).length === 0,
    };
  };

  const handleSave = async () => {
    if (!user || !supabase) {
      onToast?.("error", "Session not ready. Please refresh and try again.");
      return;
    }
    const validation = validateForm();
    if (!validation.isValid) return;
    if (saving) return;

    const taxonomy = buildBusinessTaxonomyPayload({
      business_type: form.business_type.trim(),
      category: profile?.category || "",
    });
    const userPayload = {
      business_name: form.business_name.trim(),
      full_name: form.business_name.trim(),
      business_type: taxonomy.business_type,
      category: taxonomy.category,
      description: form.description.trim(),
      website: form.website.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      hours_json: buildHoursPayload(),
      social_links_json: buildSocialsPayload(),
      profile_photo_url: form.profile_photo_url.trim(),
      cover_photo_url: form.cover_photo_url.trim(),
    };
    const filteredPayload = filterPayloadByProfile(userPayload, profile);
    if (!Object.keys(filteredPayload).length) {
      onToast?.(
        "error",
        "Profile fields are not available in the users table schema."
      );
      return;
    }

    const previous = profile;
    onProfileUpdate?.({ ...profile, ...userPayload });
    setSaving(true);
    setSavingMessage("Saving profile...");

    try {
      const { data, error } = await supabase
        .from("users")
        .update(filteredPayload)
        .eq("id", user.id)
        .select("*")
        .maybeSingle();

      if (error) {
        onProfileUpdate?.(previous);
        onToast?.("error", error.message || "Failed to save profile.");
        return;
      }
      if (!data) {
        onProfileUpdate?.(previous);
        onToast?.("error", "Profile update failed to return data.");
        return;
      }

      const businessPayload = {
        owner_user_id: user.id,
        business_name: userPayload.business_name,
        business_type: userPayload.business_type,
        category: userPayload.category,
        description: userPayload.description,
        website: userPayload.website,
        phone: userPayload.phone,
        profile_photo_url: userPayload.profile_photo_url,
        cover_photo_url: userPayload.cover_photo_url,
        address: userPayload.address,
        city: userPayload.city,
        hours_json: userPayload.hours_json,
        social_links_json: userPayload.social_links_json,
      };

      const { error: businessError } = await supabase.from("businesses").upsert(
        businessPayload,
        {
          onConflict: "owner_user_id",
          ignoreDuplicates: false,
        }
      );

      if (businessError) {
        onProfileUpdate?.(previous);
        onToast?.("error", businessError.message || "Failed to sync business profile.");
        return;
      }

      onProfileUpdate?.({ ...previous, ...data, ...userPayload });
      await refreshProfile?.();
      setEditMode(false);
      setIsDirty(false);
      onToast?.("success", "Profile updated.");
    } catch (err) {
      onProfileUpdate?.(previous);
      onToast?.("error", err.message || "Failed to save profile.");
    } finally {
      setSaving(false);
      setSavingMessage("");
    }
  };

  const inputClass = `w-full rounded-xl border px-4 py-2 text-base md:text-sm focus:outline-none focus:ring-4 ${tone.input}`;
  const labelClass = `text-xs font-semibold uppercase tracking-[0.18em] ${tone.textSoft}`;

  return (
    <div className="space-y-6">
      <div className={`rounded-xl border ${tone.cardBorder} ${tone.cardSoft} p-5 md:p-6`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className={`text-lg font-semibold ${tone.textStrong}`}>Overview</h2>
            <p className={`text-sm ${tone.textMuted}`}>
              Keep your profile current so customers can find you faster.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditMode((prev) => !prev)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${tone.buttonSecondary}`}
            >
              {editMode ? "Close editor" : "Edit profile"}
            </button>
            {editMode ? (
              <button
                type="button"
                disabled={!(hasChanges || isDirty) || saving}
                onClick={handleSave}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${tone.buttonSecondary} ${
                  !(hasChanges || isDirty) || saving ? "opacity-60 cursor-not-allowed" : ""
                }`}
              >
                {saving ? savingMessage || "Saving..." : "Save changes"}
              </button>
            ) : null}
          </div>
        </div>

      </div>

      {editMode ? (
        <div className={`rounded-xl border ${tone.cardBorder} ${tone.cardSoft} p-5 md:p-6`}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>Business name</label>
              <input
                type="text"
                value={form.business_name}
                onChange={handleChange("business_name")}
                className={inputClass}
              />
              {errors.business_name ? (
                <p className={tone.errorText}>{errors.business_name}</p>
              ) : null}
            </div>
            <div>
              <label className={labelClass}>Business type</label>
              <select
                value={form.business_type}
                onChange={handleChange("business_type")}
                className={inputClass}
              >
                <option value="">Select a business type</option>
                {BUSINESS_TYPE_OPTIONS.map((type) => (
                  <option key={type.slug} value={type.slug}>
                    {type.label}
                  </option>
                ))}
              </select>
              {errors.business_type ? (
                <p className={tone.errorText}>{errors.business_type}</p>
              ) : null}
            </div>
            <div>
              <label className={labelClass}>City</label>
              <input
                type="text"
                value={form.city}
                onChange={handleChange("city")}
                className={inputClass}
              />
              {errors.city ? <p className={tone.errorText}>{errors.city}</p> : null}
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={handleChange("phone")}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={handleChange("email")}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Website</label>
              <input
                type="url"
                value={form.website}
                onChange={handleChange("website")}
                className={inputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Address</label>
              <input
                type="text"
                value={form.address}
                onChange={handleChange("address")}
                className={inputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Description</label>
              <textarea
                value={form.description}
                onChange={handleChange("description")}
                rows={4}
                className={inputClass}
              />
              {errors.description ? (
                <p className={tone.errorText}>{errors.description}</p>
              ) : null}
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Hours</label>
              <div className="mt-3 space-y-2">
                {DAYS.map(({ key, label }, index) => {
                  const dayHours = form.hours?.[key] || { open: "", close: "", isClosed: false };
                  return (
                    <div
                      key={key}
                      className={`flex flex-col gap-2 sm:flex-row sm:items-center rounded-lg border px-3 py-2 ${tone.cardBorder} ${tone.cardSoft}`}
                    >
                      <div className="flex items-center justify-between sm:w-28">
                        <span className={`text-sm font-medium ${tone.textStrong}`}>{label}</span>
                      </div>
                      <div className="flex flex-1 flex-wrap items-center gap-2">
                        <label className={`flex items-center gap-2 cursor-pointer select-none`}>
                          <input
                            type="checkbox"
                            checked={dayHours.isClosed}
                            onChange={handleHourChange(key, "isClosed")}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className={`text-sm ${tone.textMuted}`}>Closed</span>
                        </label>
                        {!dayHours.isClosed && (
                          <>
                            <select
                              value={dayHours.open}
                              onChange={handleHourChange(key, "open")}
                              className={`flex-1 min-w-[100px] rounded-lg border px-2 py-1.5 text-base md:text-sm focus:outline-none focus:ring-2 ${tone.input}`}
                            >
                              <option value="">Opens</option>
                              {TIME_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <span className={`text-sm ${tone.textMuted}`}>to</span>
                            <select
                              value={dayHours.close}
                              onChange={handleHourChange(key, "close")}
                              className={`flex-1 min-w-[100px] rounded-lg border px-2 py-1.5 text-base md:text-sm focus:outline-none focus:ring-2 ${tone.input}`}
                            >
                              <option value="">Closes</option>
                              {TIME_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                      </div>
                      {index === 0 && (
                        <div className="flex gap-1 sm:ml-2">
                          <button
                            type="button"
                            onClick={() => copyHoursToWeekdays(key)}
                            className={`rounded px-2 py-1 text-xs ${tone.buttonSecondary}`}
                            title="Copy to Mon-Fri"
                          >
                            Weekdays
                          </button>
                          <button
                            type="button"
                            onClick={() => copyHoursToAllDays(key)}
                            className={`rounded px-2 py-1 text-xs ${tone.buttonSecondary}`}
                            title="Copy to all days"
                          >
                            All
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className={`mt-2 text-xs ${tone.textMuted}`}>
                Set your business hours. Use the buttons on Monday to quickly copy to weekdays or all days.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Social links</label>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {SOCIAL_FIELDS.map(({ key, label, placeholder }) => (
                  <div key={key} className="space-y-1">
                    <p className={`text-xs font-semibold ${tone.textMuted}`}>{label}</p>
                    <input
                      type="url"
                      value={form.socials?.[key] || ""}
                      onChange={handleSocialChange(key)}
                      className={inputClass}
                      placeholder={placeholder}
                    />
                  </div>
                ))}
              </div>
              <p className={`mt-2 text-xs ${tone.textMuted}`}>
                Optional. Add only the profiles you want to show.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className={`rounded-xl border ${tone.cardBorder} ${tone.cardSoft} p-5 md:p-6`}>
          <div className="grid gap-4 md:grid-cols-2">
            <InfoItem label="Business name" value={form.business_name} tone={tone} />
            <InfoItem
              label="Business type"
              value={getBusinessTypeLabel({ business_type: form.business_type }, "—")}
              tone={tone}
            />
            <InfoItem label="City" value={form.city} tone={tone} />
            <InfoItem label="Phone" value={form.phone || "—"} tone={tone} />
            <InfoItem label="Email" value={form.email || "—"} tone={tone} />
            <InfoItem label="Website" value={form.website || "—"} tone={tone} />
            <div className="md:col-span-2">
              <InfoItem label="Address" value={form.address || "—"} tone={tone} />
            </div>
            <div className="md:col-span-2">
              <InfoItem label="Description" value={form.description} tone={tone} />
            </div>
            <div className="md:col-span-2">
              <div className="space-y-2">
                <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${tone.textSoft}`}>
                  Hours
                </p>
                {Object.values(form.hours || {}).some(
                  (day) => day?.isClosed || (day?.open && day?.close)
                ) ? (
                  <div className="grid gap-2">
                    {DAYS.map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between gap-3">
                        <span className={`text-sm ${tone.textMuted}`}>{label}</span>
                        <span className={`text-sm ${tone.textStrong}`}>
                          {formatHoursRange(form.hours?.[key])}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={`text-sm ${tone.textStrong}`}>—</p>
                )}
              </div>
            </div>
            <div className="md:col-span-2">
              <div className="space-y-2">
                <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${tone.textSoft}`}>
                  Social links
                </p>
                {Object.values(form.socials || {}).some((value) => value && value.trim()) ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {SOCIAL_FIELDS.map(({ key, label }) => {
                      const value = form.socials?.[key];
                      if (!value || !value.trim()) return null;
                      return (
                        <div key={key} className="flex items-center justify-between gap-3">
                          <span className={`text-sm ${tone.textMuted}`}>{label}</span>
                          <a
                            href={value}
                            target="_blank"
                            rel="noreferrer"
                            className={`text-sm font-semibold ${tone.textStrong} underline underline-offset-4`}
                          >
                            {value}
                          </a>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className={`text-sm ${tone.textStrong}`}>—</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value, tone }) {
  return (
    <div className="space-y-1">
      <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${tone.textSoft}`}>
        {label}
      </p>
      <p className={`text-sm ${tone.textStrong}`}>{value}</p>
    </div>
  );
}

function allowButtonStyle(tone) {
  return `${tone.buttonSecondary} text-xs`;
}
