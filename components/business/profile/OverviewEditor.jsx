"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Globe, MapPin, Phone } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { getBusinessTypeOptions } from "@/lib/taxonomy/businessTypes";
import {
  buildBusinessTaxonomyPayload,
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

  const inputClass = `w-full rounded-2xl border px-4 py-2.5 text-base md:text-sm focus:outline-none focus:ring-4 ${tone.input}`;
  const labelClass = `text-[11px] font-medium tracking-[0.08em] ${tone.textSoft}`;

  if (!editMode) {
    const essentials = [
      {
        key: "address",
        label: "Address",
        icon: MapPin,
        value: [form.address, form.city].filter(Boolean).join(", "),
      },
      {
        key: "phone",
        label: "Phone",
        icon: Phone,
        value: form.phone,
      },
      {
        key: "website",
        label: "Website",
        icon: Globe,
        value: form.website,
      },
    ].filter((item) => item.value);

    const hours = DAYS.map(({ key, label }) => ({
      key,
      label,
      value: formatHoursRange(form.hours?.[key]),
    })).filter((item) => item.value && item.value !== "—");

    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <div className="space-y-4">
          <div className="max-w-[44rem]">
            <p className={`text-[1rem] leading-7 ${tone.textMuted}`}>
              {form.description ||
                "Add a short description so customers can quickly understand what makes your business distinct."}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {essentials.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {essentials.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.key}
                    className={`rounded-[20px] bg-slate-50/75 px-4 py-3`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-white p-2 text-[#6a3df0] shadow-sm">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${tone.textSoft}`}>
                          {item.label}
                        </p>
                        <p className={`mt-1 text-sm font-medium ${tone.textStrong}`}>
                          {item.value}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className={`rounded-[20px] bg-slate-50/75 px-4 py-3`}>
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-xl bg-white p-2 text-[#6a3df0] shadow-sm">
                <Clock className="h-4 w-4" />
              </div>
              <p className={`text-sm font-semibold ${tone.textStrong}`}>Hours</p>
            </div>

            {hours.length ? (
              <div className="space-y-2">
                {hours.map((entry) => (
                  <div
                    key={entry.key}
                    className="flex items-center justify-between gap-4 rounded-2xl bg-white px-3 py-2 text-sm"
                  >
                    <span className={`font-medium ${tone.textStrong}`}>{entry.label}</span>
                    <span className={tone.textMuted}>{entry.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-white px-4 py-4 text-sm text-slate-500">
                Hours not listed yet.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
      <div className="space-y-5">
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
                      className={`flex flex-col gap-2 sm:flex-row sm:items-center rounded-2xl border px-3 py-2 ${tone.cardBorder} ${tone.cardSoft}`}
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
                            className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                            title="Copy to Mon-Fri"
                          >
                            Weekdays
                          </button>
                          <button
                            type="button"
                            onClick={() => copyHoursToAllDays(key)}
                            className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
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
                    <p className={`text-[11px] font-medium ${tone.textMuted}`}>{label}</p>
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

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!(hasChanges || isDirty) || saving}
          onClick={handleSave}
          className={`dashboard-primary-action rounded-full bg-[#6E34FF] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E2DE0] ${
            !(hasChanges || isDirty) || saving ? "cursor-not-allowed opacity-60" : ""
          }`}
        >
          {saving ? savingMessage || "Saving..." : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => setEditMode(false)}
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
