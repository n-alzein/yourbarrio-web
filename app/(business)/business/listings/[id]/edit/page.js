"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import RichTextDescriptionEditor from "@/components/editor/RichTextDescriptionEditor";
import { extractPhotoUrls } from "@/lib/listingPhotos";
import { stripHtmlToText } from "@/lib/listingDescription";
import { retry } from "@/lib/retry";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

export default function EditListingPage() {
  const router = useRouter();
  const params = useParams();
  const listingId = params.id;
  const listingRef = useMemo(() => {
    if (Array.isArray(listingId)) return listingId[0] || "";
    return typeof listingId === "string" ? listingId : "";
  }, [listingId]);

  const { supabase, user, profile, loadingUser } = useAuth();
  const accountId = user?.id || profile?.id || null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const MAX_PHOTOS = 10;
  const sectionCard =
    "rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8 shadow-lg backdrop-blur-xl";
  const labelBase = "text-sm font-semibold text-white/80";
  const helperBase = "text-xs text-white/50";
  const inputBase =
    "w-full mt-2 px-4 py-3 h-12 rounded-xl bg-white/10 text-white placeholder-white/40 border border-white/10 focus:border-white/30 focus:ring-4 focus:ring-blue-500/30 outline-none transition";
  const selectBase =
    "w-full mt-2 px-4 py-3 h-12 rounded-xl bg-white/10 text-white border border-white/10 focus:border-white/30 focus:ring-4 focus:ring-blue-500/30 outline-none transition appearance-none";

  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    categoryId: "",
    city: "",
    inventoryQuantity: "",
    inventoryStatus: "in_stock",
    lowStockThreshold: "",
  });

  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");
  const [existingPhotos, setExistingPhotos] = useState([]);
  const [internalListingId, setInternalListingId] = useState(null);
  const [newPhotos, setNewPhotos] = useState([]);
  const newPhotoPreviews = useMemo(
    () => newPhotos.map((file) => ({ url: URL.createObjectURL(file) })),
    [newPhotos]
  );

  useEffect(
    () => () => {
      newPhotoPreviews.forEach(({ url }) => URL.revokeObjectURL(url));
    },
    [newPhotoPreviews]
  );

  // Load existing listing
  useEffect(() => {
    if (loadingUser && !accountId) return;
    if (!accountId || !listingRef) {
      setLoading(false);
      return;
    }
    async function loadListing() {
      try {
        const response = await retry(
          () =>
            fetchWithTimeout(`/api/business/listings?id=${encodeURIComponent(listingRef)}`, {
              method: "GET",
              credentials: "include",
              timeoutMs: 12000,
            }),
          { retries: 1, delayMs: 600 }
        );

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Failed to load listing");
        }

        const payload = await response.json();
        const data = payload?.listing;
        if (!data) throw new Error("Listing not found");
        setInternalListingId(data.id || null);

        setForm({
          title: data.title || "",
          description: data.description || "",
          price: data.price || "",
          categoryId: data.category_id || "",
          city: data.city || "",
          inventoryQuantity: data.inventory_quantity ?? "",
          inventoryStatus: data.inventory_status || "in_stock",
          lowStockThreshold: data.low_stock_threshold ?? "",
        });
        setExistingPhotos(extractPhotoUrls(data.photo_url));
      } catch (err) {
        console.error("❌ Fetch listing error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadListing();
  }, [loadingUser, accountId, supabase, listingRef]);

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

  const handleAddNewPhotos = (files) => {
    const incoming = Array.from(files || []);
    if (!incoming.length) return;

    const availableSlots =
      MAX_PHOTOS - existingPhotos.length - newPhotos.length;
    if (availableSlots <= 0) return;

    setNewPhotos((prev) => [
      ...prev,
      ...incoming.slice(0, Math.max(0, availableSlots)),
    ]);
  };

  const handleRemoveExisting = (index) => {
    setExistingPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveNew = (index) => {
    setNewPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  async function uploadNewPhotos() {
    if (!newPhotos.length) return [];
    const client = getSupabaseBrowserClient() ?? supabase;
    if (!client || !accountId) throw new Error("Connection not ready. Try again.");

    const uploaded = [];

    for (const file of newPhotos) {
      const fileName = `${accountId}-${Date.now()}-${crypto
        .randomUUID?.()
        ?.slice(0, 6) || Math.random().toString(36).slice(2, 8)}-${
        file.name
      }`;

      const { error } = await retry(
        async () => {
          const result = await client.storage
            .from("listing-photos")
            .upload(fileName, file, {
              contentType: file.type,
              upsert: false,
              cacheControl: "3600",
            });
          if (result.error) throw result.error;
          return result;
        },
        { retries: 1, delayMs: 600 }
      );

      if (error) {
        console.error("❌ Upload error:", error);
        throw new Error("Failed to upload one of the photos.");
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

    const client = getSupabaseBrowserClient() ?? supabase;
    if (!client || !accountId) {
      alert("Connection not ready. Please try again.");
      return;
    }

    const resetTimer = setTimeout(() => setSaving(false), 20000);
    try {
      setSaving(true);

      const uploaded = await uploadNewPhotos();

      const photoUrls = [...existingPhotos, ...uploaded].slice(0, MAX_PHOTOS);

      if (!photoUrls.length) {
        alert("Please keep at least one photo.");
        return;
      }

      if (!form.categoryId) {
        alert("Please select a category.");
        return;
      }
      if (!stripHtmlToText(form.description || "").trim()) {
        alert("Please add a description.");
        return;
      }

      const selectedCategory = categories.find(
        (category) => category.id === form.categoryId
      );
      const payload = {
        title: (form.title || "").trim(),
        description: form.description || "",
        price: form.price,
        category: selectedCategory?.name || null,
        category_id: form.categoryId,
        city: form.city,
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
        photo_url: JSON.stringify(photoUrls),
      };

      const { data, error } = await retry(
        async () => {
          if (!internalListingId) {
            throw new Error("Listing reference could not be resolved.");
          }
          const result = await client
            .from("listings")
            .update(payload)
            .eq("id", internalListingId)
            .eq("business_id", accountId)
            .select("id")
            .single();
          if (result.error) throw result.error;
          return result;
        },
        { retries: 1, delayMs: 600 }
      );

      if (error) {
        throw error;
      }

      if (!data?.id) {
        throw new Error("Save did not complete. Please retry.");
      }

      setSaving(false);
      router.push("/business/listings");
    } catch (err) {
      console.error("❌ Update error:", err);
      alert(err.message || "Failed to save changes. Please try again.");
    } finally {
      clearTimeout(resetTimer);
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-white text-center py-20">Loading listing...</div>;
  }

  if (loadingUser && !accountId) {
    return <div className="text-white text-center py-20">Loading account...</div>;
  }

  if (!accountId) {
    return <div className="text-white text-center py-20">Redirecting to login...</div>;
  }

  if (!supabase && !getSupabaseBrowserClient()) {
    return <div className="text-white text-center py-20">Connecting to your account...</div>;
  }

  // -------------------------------------------------------------------------
  // UI
  // -------------------------------------------------------------------------

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <div className="mb-12 text-center space-y-3">
        <p className="text-xs uppercase tracking-[0.32em] text-white/50">
          Business listings
        </p>
        <h1 className="text-4xl md:text-5xl font-semibold text-white">
          Edit listing
        </h1>
        <p className="text-white/60 text-base md:text-lg">
          Update details and availability to keep customers informed.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <section className={sectionCard}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Photos</h2>
              <p className="text-sm text-white/60">
                Add up to {MAX_PHOTOS} photos. The first photo is your cover.
              </p>
            </div>
            <span className="text-xs text-white/60">
              {existingPhotos.length + newPhotos.length}/{MAX_PHOTOS} total
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {existingPhotos.map((src, idx) => (
              <div key={`${src}-${idx}`} className="relative group">
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
                  onClick={() => handleRemoveExisting(idx)}
                  className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition"
                  aria-label="Remove photo"
                >
                  ✕
                </button>
              </div>
            ))}

            {newPhotoPreviews.map((preview, idx) => (
              <div key={`new-${idx}`} className="relative group">
                <Image
                  src={preview.url}
                  alt={`New listing photo ${idx + 1}`}
                  width={256}
                  height={144}
                  className="w-full h-36 object-cover rounded-2xl border border-dashed border-white/15"
                  unoptimized
                />
                <span className="absolute left-2 top-2 text-[11px] px-2 py-1 rounded-full bg-black/60 text-white/80">
                  New
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveNew(idx)}
                  className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition"
                  aria-label="Remove photo"
                >
                  ✕
                </button>
              </div>
            ))}

            {existingPhotos.length + newPhotos.length < MAX_PHOTOS && (
              <label className="h-36 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/30 bg-white/5 text-gray-200 cursor-pointer hover:bg-white/10 transition">
                <span className="text-sm font-semibold">Add photos</span>
                <span className="text-xs text-white/70">PNG, JPG</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleAddNewPhotos(e.target.files);
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
              Keep your title and description aligned with what is in stock.
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
              Update quantities and availability as inventory changes.
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
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
