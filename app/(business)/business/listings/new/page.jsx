"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import RichTextDescriptionEditor from "@/components/editor/RichTextDescriptionEditor";
import { useAuth } from "@/components/AuthProvider";
import { stripHtmlToText } from "@/lib/listingDescription";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function NewListingPage() {
  const { supabase, user, profile, loadingUser } = useAuth();
  const router = useRouter();
  const accountId = user?.id || profile?.id || null;

  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    categoryId: "",
    inventoryQuantity: "",
    inventoryStatus: "in_stock",
    lowStockThreshold: "",
  });

  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const MAX_PHOTOS = 10;
  const UPLOAD_TIMEOUT_MS = 20000;
  const PUBLISH_TIMEOUT_MS = 20000;
  const sectionCard =
    "rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8 shadow-lg backdrop-blur-xl";
  const labelBase = "text-sm font-semibold text-white/80";
  const helperBase = "text-xs text-white/50";
  const inputBase =
    "w-full mt-2 px-4 py-3 h-12 rounded-xl bg-white/10 text-white placeholder-white/40 border border-white/10 focus:border-white/30 focus:ring-4 focus:ring-blue-500/30 outline-none transition";
  const selectBase =
    "w-full mt-2 px-4 py-3 h-12 rounded-xl bg-white/10 text-white border border-white/10 focus:border-white/30 focus:ring-4 focus:ring-blue-500/30 outline-none transition appearance-none";

  const photoPreviews = useMemo(
    () => photos.map((file) => URL.createObjectURL(file)),
    [photos]
  );

  useEffect(
    () => () => {
      photoPreviews.forEach((url) => URL.revokeObjectURL(url));
    },
    [photoPreviews]
  );

  useEffect(() => {
    let isMounted = true;

    async function loadCategories() {
      setCategoriesLoading(true);
      setCategoriesError("");

      try {
        const client = getSupabaseBrowserClient() ?? supabase;
        if (!client) {
          throw new Error("Connection not ready. Please try again.");
        }

        const { data, error } = await client
          .from("business_categories")
          .select("id,name,slug")
          .eq("is_active", true)
          .order("name", { ascending: true });

        if (error) throw error;

        if (isMounted) {
          setCategories(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Failed to load categories", err);
        if (isMounted) {
          setCategoriesError(
            err.message || "Unable to load categories. Please refresh."
          );
        }
      } finally {
        if (isMounted) setCategoriesLoading(false);
      }
    }

    loadCategories();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const handleAddPhotos = (files) => {
    const incoming = Array.from(files || []);
    if (!incoming.length) return;

    setPhotos((prev) => {
      const combined = [...prev, ...incoming].slice(0, MAX_PHOTOS);
      return combined;
    });
  };

  const handleRemovePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const withTimeout = async (promise, timeoutMs, message) => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(message)),
        timeoutMs
      );
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  async function uploadPhotos() {
    if (!photos.length) return [];
    const client = getSupabaseBrowserClient() ?? supabase;
    if (!client || !accountId) throw new Error("Connection not ready. Try again.");

    const uploaded = [];
    for (const file of photos) {
      const fileName = `${accountId}-${Date.now()}-${crypto
        .randomUUID?.()
        ?.slice(0, 6) || Math.random().toString(36).slice(2, 8)}-${file.name}`;

      const { data, error } = await withTimeout(
        client.storage.from("listing-photos").upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "image/jpeg",
        }),
        UPLOAD_TIMEOUT_MS,
        "Photo upload timed out. Please try again."
      );

      if (error) {
        console.error("Photo upload failed", error);
        throw new Error("Failed to upload one of the photos");
      }

      const { data: url } = client.storage
        .from("listing-photos")
        .getPublicUrl(fileName);

      if (url?.publicUrl) {
        uploaded.push(url.publicUrl);
      }
    }

    return uploaded;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError("");
    setSubmitSuccess("");

    const client = getSupabaseBrowserClient() ?? supabase;
    if (!client || !accountId) {
      setSubmitError("Connection not ready. Please try again.");
      return;
    }

    if (!photos.length) {
      setSubmitError("Please add at least one photo (up to 10).");
      return;
    }

    if (!form.categoryId) {
      setSubmitError("Please select a category.");
      return;
    }
    if (!stripHtmlToText(form.description || "").trim()) {
      setSubmitError("Please add a description.");
      return;
    }

    setSaving(true);

    try {
      const photo_urls = await withTimeout(
        uploadPhotos(),
        UPLOAD_TIMEOUT_MS * Math.max(1, photos.length),
        "Photo upload timed out. Please try again."
      );

      const businessQuery = client
        .from("users")
        .select("city")
        .eq("id", accountId)
        .single();
      const { data: business, error: bizError } = await withTimeout(
        businessQuery,
        PUBLISH_TIMEOUT_MS,
        "Fetching business details timed out. Please try again."
      );

      if (bizError) {
        throw bizError;
      }

      const selectedCategory = categories.find(
        (category) => category.id === form.categoryId
      );
      const insertQuery = client.from("listings").insert({
        business_id: accountId,
        title: form.title,
        description: form.description,
        price: form.price,
        category: selectedCategory?.name || null,
        category_id: form.categoryId,
        inventory_status: form.inventoryStatus,
        inventory_quantity:
          form.inventoryStatus === "out_of_stock"
            ? 0
            : form.inventoryQuantity === ""
            ? null
            : Number(form.inventoryQuantity),
        low_stock_threshold:
          form.inventoryStatus === "in_stock" && form.lowStockThreshold !== ""
            ? Number(form.lowStockThreshold)
            : null,
        inventory_last_updated_at: new Date().toISOString(),
        city: business?.city || null,
        photo_url: photo_urls.length ? JSON.stringify(photo_urls) : null,
      });
      const { error } = await withTimeout(
        insertQuery,
        PUBLISH_TIMEOUT_MS,
        "Publishing timed out. Please try again."
      );

      if (error) {
        throw error;
      }

      setSubmitSuccess("Listing published! Redirecting...");
      router.push("/business/listings");
    } catch (err) {
      console.error("Publish listing failed", err);
      setSubmitError(err.message || "Failed to publish listing. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loadingUser && !accountId) {
    return (
      <p className="text-white text-center py-20">
        Loading account...
      </p>
    );
  }

  if (!accountId) {
    return (
      <p className="text-white text-center py-20">
        Redirecting to login...
      </p>
    );
  }

  if (!supabase && !getSupabaseBrowserClient()) {
    return (
      <p className="text-white text-center py-20">
        Connecting to your account...
      </p>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <div className="mb-12 text-center space-y-3">
        <p className="text-xs uppercase tracking-[0.32em] text-white/50">
          Business listings
        </p>
        <h1 className="text-4xl md:text-5xl font-semibold text-white">
          Create a new listing
        </h1>
        <p className="text-white/60 text-base md:text-lg">
          Keep details tidy so customers can decide quickly.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <section className={sectionCard}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Photos</h2>
              <p className="text-sm text-white/60">
                Add up to {MAX_PHOTOS} photos. The first photo becomes the cover.
              </p>
            </div>
            <span className="text-xs text-white/60">
              {photos.length}/{MAX_PHOTOS} added
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photoPreviews.map((src, idx) => (
              <div key={src} className="relative group">
                <Image
                  src={src}
                  alt={`Listing photo ${idx + 1}`}
                  width={256}
                  height={144}
                  className="w-full h-36 object-cover rounded-2xl border border-white/15"
                  unoptimized
                />
                <button
                  type="button"
                  onClick={() => handleRemovePhoto(idx)}
                  className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition"
                  aria-label="Remove photo"
                >
                  ✕
                </button>
              </div>
            ))}

            {photos.length < MAX_PHOTOS && (
              <label className="h-36 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/30 bg-white/5 text-gray-200 cursor-pointer hover:bg-white/10 transition">
                <span className="text-sm font-semibold">Add photos</span>
                <span className="text-xs text-white/70">PNG, JPG</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleAddPhotos(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        </section>

        <section className={sectionCard}>
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white">Listing details</h2>
            <p className="text-sm text-white/60">
              Give your listing a clear title, category, and description.
            </p>
          </div>
          <div className="grid gap-6">
            <div>
              <label className={labelBase} htmlFor="listing-title">
                Listing title
              </label>
              <input
                id="listing-title"
                className={inputBase}
                placeholder="Ex: House-made cold brew concentrate"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
              <p className={helperBase}>Keep it short and descriptive.</p>
            </div>

            <div>
              <RichTextDescriptionEditor
                label="Description"
                value={form.description}
                onChange={(nextDescription) =>
                  setForm({ ...form, description: nextDescription })
                }
                minHeight={180}
                placeholder="Share materials, flavors, or what makes it special."
                helpText="Use headings, bullets, and links to make details easy to scan."
              />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className={labelBase} htmlFor="listing-category">
                  Category
                </label>
                <select
                  id="listing-category"
                  className={selectBase}
                  value={form.categoryId}
                  onChange={(e) =>
                    setForm({ ...form, categoryId: e.target.value })
                  }
                  required
                  disabled={categoriesLoading}
                >
                  <option value="" className="text-black">
                    {categoriesLoading ? "Loading categories..." : "Select category"}
                  </option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id} className="text-black">
                      {cat.name}
                    </option>
                  ))}
                </select>
                {categoriesError && (
                  <p className="text-xs text-red-200 mt-2">{categoriesError}</p>
                )}
              </div>

              <div>
                <label className={labelBase} htmlFor="listing-price">
                  Price
                </label>
                <input
                  id="listing-price"
                  className={inputBase}
                  type="number"
                  placeholder="Ex: 49.99"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  required
                />
                <p className={helperBase}>Use numbers only. Currency is USD.</p>
              </div>
            </div>
          </div>
        </section>

        <section className={sectionCard}>
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white">Inventory</h2>
            <p className="text-sm text-white/60">
              Keep availability accurate to build trust.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className={labelBase} htmlFor="listing-status">
                Availability
              </label>
              <select
                id="listing-status"
                className={selectBase}
                value={form.inventoryStatus}
                onChange={(e) => {
                  const nextStatus = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    inventoryStatus: nextStatus,
                    inventoryQuantity:
                      nextStatus === "out_of_stock" ? "0" : prev.inventoryQuantity,
                    lowStockThreshold:
                      nextStatus === "in_stock" ? prev.lowStockThreshold : "",
                  }));
                }}
              >
                <option value="always_available" className="text-black">
                  Always available
                </option>
                <option value="in_stock" className="text-black">
                  Limited stock (default)
                </option>
                <option value="seasonal" className="text-black">
                  Seasonal or temporary
                </option>
                <option value="out_of_stock" className="text-black">
                  Out of stock
                </option>
              </select>
            </div>

            <div>
              <label className={labelBase} htmlFor="listing-quantity">
                Quantity on hand
              </label>
              <input
                id="listing-quantity"
                className={inputBase}
                type="number"
                min="0"
                step="1"
                placeholder="Ex: 20"
                value={form.inventoryQuantity}
                onChange={(e) =>
                  setForm({ ...form, inventoryQuantity: e.target.value })
                }
              />
              <p className={helperBase}>Leave blank if not tracking quantity.</p>
            </div>
          </div>

          {form.inventoryStatus === "in_stock" && (
            <div className="mt-6">
              <label className={labelBase} htmlFor="listing-threshold">
                Low stock alert
              </label>
              <input
                id="listing-threshold"
                className={inputBase}
                type="number"
                min="0"
                step="1"
                placeholder="Ex: 5"
                value={form.lowStockThreshold}
                onChange={(e) =>
                  setForm({ ...form, lowStockThreshold: e.target.value })
                }
              />
              <p className={helperBase}>
                Get a nudge when inventory drops below this number.
              </p>
            </div>
          )}
        </section>

        <div className="flex flex-col-reverse sm:flex-row gap-4 pt-2">
          <button
            type="button"
            onClick={() => router.push("/business/listings")}
            className="flex-1 py-4 rounded-xl backdrop-blur-md bg-white/10 border border-white/20 text-white text-base font-medium hover:bg-white/20 hover:border-white/30 transition"
            disabled={saving}
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-base font-semibold shadow-xl hover:opacity-90 transition"
          >
            {saving ? "Publishing..." : "Publish listing"}
          </button>
        </div>
        {(submitError || submitSuccess) && (
          <div className="pt-3">
            {submitError && (
              <p role="alert" className="text-sm text-red-200">
                {submitError}
              </p>
            )}
            {!submitError && submitSuccess && (
              <p className="text-sm text-emerald-200">
                {submitSuccess}
              </p>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
