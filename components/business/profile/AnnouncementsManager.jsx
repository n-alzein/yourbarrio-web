"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function toInputDate(value) {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  } catch {
    return "";
  }
}

function toIsoOrNull(value) {
  return value ? new Date(value).toISOString() : null;
}

export default function AnnouncementsManager({
  announcements,
  setAnnouncements,
  tone,
  businessId,
  supabase,
  onToast,
  createTrigger,
}) {
  const titleRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const initialForm = useMemo(
    () => ({
      title: "",
      body: "",
      is_published: true,
      starts_at: "",
      ends_at: "",
    }),
    []
  );

  const [form, setForm] = useState(initialForm);

  const formatItemMeta = (item) => {
    const meta = [];
    if (item.is_published) {
      meta.push("Live");
    } else {
      meta.push("Draft");
    }
    if (item.starts_at) {
      meta.push(`Starts ${new Date(item.starts_at).toLocaleDateString()}`);
    }
    if (item.ends_at) {
      meta.push(`Ends ${new Date(item.ends_at).toLocaleDateString()}`);
    }
    if (!item.starts_at && !item.ends_at) {
      meta.push("No schedule");
    }
    return meta.join(" · ");
  };

  const runWithTimeout = async (promise, ms, label) => {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${label} timed out. Please try again.`));
      }, ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  useEffect(() => {
    if (!createTrigger) return;
    titleRef.current?.focus();
  }, [createTrigger]);

  const handleChange = (field) => (event) => {
    const value = field === "is_published" ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setForm({
      title: item.title || "",
      body: item.body || "",
      is_published: item.is_published ?? true,
      starts_at: toInputDate(item.starts_at),
      ends_at: toInputDate(item.ends_at),
    });
    titleRef.current?.focus();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!supabase) {
      onToast?.("error", "Connection not ready. Please refresh and try again.");
      return;
    }
    if (!businessId) {
      onToast?.("error", "Business profile not ready. Refresh and try again.");
      return;
    }
    if (!form.title.trim() || !form.body.trim()) {
      onToast?.("error", "Title and announcement body are required.");
      return;
    }

    const payload = {
      business_id: businessId,
      title: form.title.trim(),
      body: form.body.trim(),
      is_published: form.is_published,
      starts_at: toIsoOrNull(form.starts_at),
      ends_at: toIsoOrNull(form.ends_at),
    };

    setSaving(true);

    try {
      if (editingId) {
        const previous = announcements;
        setAnnouncements((prev) =>
          prev.map((item) =>
            item.id === editingId ? { ...item, ...payload } : item
          )
        );

        const { error } = await runWithTimeout(
          supabase
            .from("business_announcements")
            .update(payload)
            .eq("id", editingId),
          12000,
          "Update announcement"
        );

        if (error) {
          setAnnouncements(previous);
          onToast?.("error", error.message || "Failed to update announcement.");
        } else {
          onToast?.("success", "Announcement updated.");
          resetForm();
        }
      } else {
        const { data, error } = await runWithTimeout(
          supabase
            .from("business_announcements")
            .insert(payload)
            .select("*")
            .single(),
          12000,
          "Post announcement"
        );

        if (error) {
          onToast?.("error", error.message || "Failed to post announcement.");
        } else if (data) {
          setAnnouncements((prev) => [data, ...prev]);
          onToast?.("success", "Announcement posted.");
          resetForm();
        }
      }
    } catch (err) {
      onToast?.("error", err.message || "Failed to save announcement.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!supabase) {
      onToast?.("error", "Connection not ready. Please refresh and try again.");
      return;
    }
    if (!confirm("Delete this announcement?")) return;
    const previous = announcements;
    setAnnouncements((prev) => prev.filter((item) => item.id !== id));

    const { error } = await supabase
      .from("business_announcements")
      .delete()
      .eq("id", id);

    if (error) {
      setAnnouncements(previous);
      onToast?.("error", error.message || "Failed to delete announcement.");
    } else {
      onToast?.("success", "Announcement deleted.");
    }
  };

  const handleTogglePublish = async (item) => {
    if (!supabase) {
      onToast?.("error", "Connection not ready. Please refresh and try again.");
      return;
    }
    const previous = announcements;
    const nextValue = !item.is_published;

    setAnnouncements((prev) =>
      prev.map((entry) =>
        entry.id === item.id ? { ...entry, is_published: nextValue } : entry
      )
    );

    const { error } = await supabase
      .from("business_announcements")
      .update({ is_published: nextValue })
      .eq("id", item.id);

    if (error) {
      setAnnouncements(previous);
      onToast?.("error", error.message || "Failed to update publish state.");
    }
  };

  return (
    <div className="space-y-3.5">
      <div className="rounded-[20px] border border-slate-200/70 bg-slate-50/80 p-3.5 sm:p-4">
        <form onSubmit={handleSubmit} className="space-y-2.5">
          <div>
            <label className="text-[11px] font-medium tracking-[0.04em] text-slate-500">
              Title
            </label>
            <input
              ref={titleRef}
              type="text"
              value={form.title}
              onChange={handleChange("title")}
              placeholder="Share a quick headline"
              className={`mt-1 w-full rounded-xl border px-3.5 py-2 text-base md:text-sm focus:outline-none focus:ring-4 ${tone.input}`}
            />
          </div>
          <div>
            <label className="text-[11px] font-medium tracking-[0.04em] text-slate-500">
              Update
            </label>
            <textarea
              value={form.body}
              onChange={handleChange("body")}
              rows={2}
              placeholder="Short promos, schedule notes, or timely changes."
              className={`mt-1 min-h-[92px] w-full rounded-xl border px-3.5 py-2.5 text-base md:text-sm focus:outline-none focus:ring-4 ${tone.input}`}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-[11px] font-medium tracking-[0.04em] text-slate-500">
                Starts at
              </label>
              <input
                type="datetime-local"
                value={form.starts_at}
                onChange={handleChange("starts_at")}
                className={`mt-1 w-full rounded-xl border px-3.5 py-2 text-base md:text-sm focus:outline-none focus:ring-4 ${tone.input}`}
              />
            </div>
            <div>
              <label className="text-[11px] font-medium tracking-[0.04em] text-slate-500">
                Ends at
              </label>
              <input
                type="datetime-local"
                value={form.ends_at}
                onChange={handleChange("ends_at")}
                className={`mt-1 w-full rounded-xl border px-3.5 py-2 text-base md:text-sm focus:outline-none focus:ring-4 ${tone.input}`}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2.5 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <label className={`inline-flex items-center gap-2 text-sm ${tone.textMuted}`}>
              <input
                type="checkbox"
                checked={form.is_published}
                onChange={handleChange("is_published")}
                className="h-4 w-4"
              />
              Publish immediately
            </label>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="submit"
                disabled={saving}
                className="dashboard-primary-action rounded-full bg-[#6E34FF] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5E2DE0]"
              >
                {saving ? "Saving..." : editingId ? "Update announcement" : "Post announcement"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </div>

      {!announcements.length ? (
        <div className="rounded-[18px] border border-dashed border-slate-200/90 bg-slate-50/70 px-4 py-3.5">
          <p className={`text-sm font-medium ${tone.textStrong}`}>No updates yet</p>
          <p className={`mt-1 text-sm ${tone.textMuted}`}>
            Keep it brief. Short notices, promos, or schedule changes work best here.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {announcements.map((item) => (
            <article
              key={item.id}
              className="rounded-[18px] border border-slate-200/70 bg-white/85 px-4 py-3.5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className={`truncate text-sm font-semibold ${tone.textStrong}`}>
                    {item.title}
                  </p>
                  <p className={`mt-1 text-xs ${tone.textMuted}`}>
                    {formatItemMeta(item)}
                  </p>
                  <p className={`mt-1.5 line-clamp-2 text-sm leading-6 ${tone.textMuted}`}>
                    {item.body}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleTogglePublish(item)}
                    className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    {item.is_published ? "Published" : "Draft"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(item)}
                    className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
