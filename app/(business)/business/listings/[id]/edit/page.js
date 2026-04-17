"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import ListingPhotoManager from "@/components/business/listings/ListingPhotoManager";
import { useAuth } from "@/components/AuthProvider";
import RichTextDescriptionEditor from "@/components/editor/RichTextDescriptionEditor";
import {
  buildListingPhotoPayloadFromDrafts,
  createLocalPhotoDraft,
  hydratePhotoDrafts,
} from "@/lib/listingPhotoDrafts";
import { normalizeImageUpload } from "@/lib/normalizeImageUpload";
import { stripHtmlToText } from "@/lib/listingDescription";
import { retry } from "@/lib/retry";
import { validateImageFile } from "@/lib/storageUpload";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import {
  dollarsInputToCents,
  centsToDollarsInput,
} from "@/lib/fulfillment";
import {
  buildListingTaxonomyPayload,
  getListingCategorySlug,
} from "@/lib/taxonomy/compat";
import { getListingCategoryOptions } from "@/lib/taxonomy/listingCategories";

const CATEGORY_OPTIONS = getListingCategoryOptions();

function logListingPhotoDebug(event, details) {
  if (process.env.NODE_ENV === "production") return;
  console.info(`[listing.photo.${event}]`, details);
}

function inferListingPhotoSource({ captureAttributePresent }) {
  if (captureAttributePresent) return "mobile_camera";
  if (typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent || "")) {
    return "mobile_library";
  }
  return "desktop_upload";
}

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
    category: "",
    city: "",
    inventoryQuantity: "",
    inventoryStatus: "in_stock",
    lowStockThreshold: "",
    pickupEnabled: true,
    localDeliveryEnabled: false,
    useBusinessDeliveryDefaults: true,
    deliveryFee: "",
  });
  const [businessFulfillmentDefaults, setBusinessFulfillmentDefaults] = useState({
    pickup_enabled_default: true,
    local_delivery_enabled_default: false,
    default_delivery_fee_cents: null,
  });

  const [photos, setPhotos] = useState([]);
  const [photoError, setPhotoError] = useState("");
  const [internalListingId, setInternalListingId] = useState(null);

  useEffect(() => {
    const client = getSupabaseBrowserClient() ?? supabase;
    if (!client || !accountId) return;
    let cancelled = false;

    (async () => {
      const { data } = await client
        .from("businesses")
        .select(
          "pickup_enabled_default,local_delivery_enabled_default,default_delivery_fee_cents"
        )
        .eq("owner_user_id", accountId)
        .maybeSingle();

      if (cancelled || !data) return;
      setBusinessFulfillmentDefaults({
        pickup_enabled_default: data.pickup_enabled_default !== false,
        local_delivery_enabled_default: data.local_delivery_enabled_default === true,
        default_delivery_fee_cents:
          typeof data.default_delivery_fee_cents === "number"
            ? data.default_delivery_fee_cents
            : null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, supabase]);

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
          category: getListingCategorySlug(data, ""),
          city: data.city || "",
          inventoryQuantity: data.inventory_quantity ?? "",
          inventoryStatus: data.inventory_status || "in_stock",
          lowStockThreshold: data.low_stock_threshold ?? "",
          pickupEnabled: data.pickup_enabled !== false,
          localDeliveryEnabled: data.local_delivery_enabled === true,
          useBusinessDeliveryDefaults: data.use_business_delivery_defaults !== false,
          deliveryFee: centsToDollarsInput(data.delivery_fee_cents),
        });
        setPhotos(hydratePhotoDrafts(data.photo_url, data.photo_variants));
      } catch (err) {
        console.error("❌ Fetch listing error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadListing();
  }, [loadingUser, accountId, supabase, listingRef]);

  const handleAddNewPhotos = async (files, inputMeta = {}) => {
    const incoming = Array.from(files || []);
    if (!incoming.length) return;

    const availableSlots = MAX_PHOTOS - photos.length;
    if (availableSlots <= 0) return;

    const accepted = [];
    for (const file of incoming.slice(0, Math.max(0, availableSlots))) {
      const source = inferListingPhotoSource(inputMeta);
      let normalizedFile;
      try {
        normalizedFile = await normalizeImageUpload(file, {
          source,
          inputControl: inputMeta?.inputControl || "listing-photo-primary",
          captureAttributePresent: inputMeta?.captureAttributePresent,
        });
      } catch (error) {
        setPhotoError(
          error?.message || "We couldn't process this image. Please try a different file."
        );
        continue;
      }

      logListingPhotoDebug("selected", {
        source,
        rawFileName: file.name || null,
        rawFileType: file.type || null,
        rawFileSize: typeof file.size === "number" ? file.size : null,
        normalizedFileName: normalizedFile.name || null,
        normalizedFileType: normalizedFile.type || null,
        normalizedFileSize: typeof normalizedFile.size === "number" ? normalizedFile.size : null,
        captureAttributePresent: Boolean(inputMeta?.captureAttributePresent),
        inputControl: inputMeta?.inputControl || "listing-photo-primary",
      });

      const validation = validateImageFile(normalizedFile, { maxSizeMB: 8 });
      if (!validation.ok) {
        setPhotoError(validation.error);
        continue;
      }
      accepted.push(createLocalPhotoDraft(normalizedFile, { source }));
    }

    if (!accepted.length) return;

    setPhotoError("");
    setPhotos((prev) => [...prev, ...accepted]);
  };

  async function uploadNewPhotos() {
    if (!photos.length) return [];
    const client = getSupabaseBrowserClient() ?? supabase;
    if (!client || !accountId) throw new Error("Connection not ready. Try again.");

    const uploaded = [];

    for (const photo of photos) {
      if (photo.status !== "new" || !photo.original.file) {
        uploaded.push(photo);
        continue;
      }
      const file = photo.original.file;
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
        uploaded.push({
          ...photo,
          original: {
            ...photo.original,
            publicUrl: url.publicUrl,
            path: `listing-photos/${fileName}`,
          },
        });
      }
    }

    return uploaded;
  }

  const handleRemovePhoto = (photoId) => {
    setPhotos((prev) => {
      const target = prev.find((photo) => photo.id === photoId);
      if (target?.status === "new" && target?.original?.previewUrl) {
        URL.revokeObjectURL(target.original.previewUrl);
      }
      return prev.filter((photo) => photo.id !== photoId);
    });
  };

  const handleBackgroundChange = (photoId, background) => {
    setPhotos((prev) =>
      prev.map((photo) =>
        photo.id === photoId
          ? {
              ...photo,
              enhancement: {
                ...photo.enhancement,
                background,
                error: "",
              },
            }
          : photo
      )
    );
  };

  const handleChooseVariant = (photoId, selectedVariant) => {
    setPhotos((prev) =>
      prev.map((photo) =>
        photo.id === photoId
          ? {
              ...photo,
              selectedVariant:
                selectedVariant === "enhanced" && !photo.enhanced?.publicUrl
                  ? "original"
                  : selectedVariant,
            }
          : photo
      )
    );
  };

  async function handleEnhancePhoto(photoId) {
    const target = photos.find((photo) => photo.id === photoId);
    if (!target?.original?.file) return;

    setPhotoError("");
    setPhotos((prev) =>
      prev.map((photo) =>
        photo.id === photoId
          ? {
              ...photo,
              enhancement: {
                ...photo.enhancement,
                isProcessing: true,
                error: "",
              },
            }
          : photo
      )
    );

    try {
      const formData = new FormData();
      formData.append("image", target.original.file, target.original.name || "listing-photo.jpg");
      formData.append("background", target.enhancement.background);
      formData.append("imageSource", target.source || "unknown");

      logListingPhotoDebug("enhance.request", {
        source: target.source || "unknown",
        rawFileName: target.original.file.name || null,
        rawFileType: target.original.file.type || null,
        rawFileSize: typeof target.original.file.size === "number" ? target.original.file.size : null,
        previewSource: target.original.previewUrl ? "object-url" : "none",
      });

      const response = await fetch("/api/images/enhance", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok || !payload?.ok || !payload?.image?.publicUrl || payload?.image?.isFallbackOriginal) {
        throw new Error(
          payload?.error?.message ||
            "We couldn't enhance this photo right now. You can keep the original and continue."
        );
      }

      logListingPhotoDebug("enhance.response", {
        source: target.source || "unknown",
        enhancedUrl: payload.image.publicUrl,
        enhancedPath: payload.image.path || null,
        enhancedContentType: payload.image.contentType || null,
        finalSelectedVariant: "enhanced",
      });

      setPhotos((prev) =>
        prev.map((photo) =>
          photo.id === photoId && payload?.image?.publicUrl
            ? {
                ...photo,
                enhanced: {
                  publicUrl: payload.image.publicUrl,
                  path: payload.image.path || null,
                  background: payload.enhancement?.background || photo.enhancement.background,
                  lighting: payload.enhancement?.lighting || "auto",
                  shadow: payload.enhancement?.shadow || "subtle",
                },
                selectedVariant: "enhanced",
                enhancement: {
                  ...photo.enhancement,
                  isProcessing: false,
                  error: "",
                },
              }
            : photo.id === photoId
            ? {
                ...photo,
                selectedVariant: "original",
                enhancement: {
                  ...photo.enhancement,
                  isProcessing: false,
                  error: "",
                },
              }
            : photo
        )
      );
    } catch (error) {
      setPhotos((prev) =>
        prev.map((photo) =>
          photo.id === photoId
            ? {
                ...photo,
                enhancement: {
                  ...photo.enhancement,
                  isProcessing: false,
                  error:
                    error?.message ||
                    "We couldn't enhance this photo right now. You can keep the original and continue.",
                },
              }
            : photo
        )
      );
    }
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
      const { photoUrls, photoVariants } = buildListingPhotoPayloadFromDrafts(uploaded);

      if (!photoUrls.length) {
        alert("Please keep at least one photo.");
        return;
      }

      if (!form.category) {
        alert("Please select a category.");
        return;
      }
      if (!stripHtmlToText(form.description || "").trim()) {
        alert("Please add a description.");
        return;
      }
      if (
        form.localDeliveryEnabled &&
        form.useBusinessDeliveryDefaults &&
        businessFulfillmentDefaults.default_delivery_fee_cents == null
      ) {
        alert("Add a default delivery fee in business settings before enabling delivery.");
        return;
      }
      const listingDeliveryFeeCents = dollarsInputToCents(form.deliveryFee);
      if (
        form.localDeliveryEnabled &&
        !form.useBusinessDeliveryDefaults &&
        (Number.isNaN(listingDeliveryFeeCents) || listingDeliveryFeeCents === null)
      ) {
        alert("Enter a valid listing delivery fee.");
        return;
      }

      const taxonomy = buildListingTaxonomyPayload({
        listing_category: form.category,
      });
      const payload = {
        title: (form.title || "").trim(),
        description: form.description || "",
        price: form.price,
        listing_category: taxonomy.listing_category,
        category: taxonomy.category,
        category_id: null,
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
        photo_variants: photoVariants.length ? photoVariants : null,
        pickup_enabled: form.pickupEnabled,
        local_delivery_enabled: form.localDeliveryEnabled,
        use_business_delivery_defaults: form.useBusinessDeliveryDefaults,
        delivery_fee_cents:
          form.localDeliveryEnabled && !form.useBusinessDeliveryDefaults
            ? listingDeliveryFeeCents
            : null,
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
        <ListingPhotoManager
          photos={photos}
          maxPhotos={MAX_PHOTOS}
          helperText={`Add up to ${MAX_PHOTOS} photos. The first photo is your cover.`}
          error={photoError}
          onAddFiles={handleAddNewPhotos}
          onRemovePhoto={handleRemovePhoto}
          onEnhancePhoto={handleEnhancePhoto}
          onChooseVariant={handleChooseVariant}
          onBackgroundChange={handleBackgroundChange}
          canAddMore={photos.length < MAX_PHOTOS}
        />

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
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                  required
                >
                  <option value="" className="text-black">
                    Select category
                  </option>
                  {CATEGORY_OPTIONS.map((category) => (
                    <option
                      key={category.slug}
                      value={category.slug}
                      className="text-black"
                    >
                      {category.label}
                    </option>
                  ))}
                </select>
                <p className={helperBase}>Choose the best fit for this item.</p>
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

        <section className={sectionCard}>
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white">Fulfillment</h2>
            <p className="text-sm text-white/60">
              Pickup stays straightforward. Offer delivery only when the fee is explicit.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <label className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
              <span className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.pickupEnabled}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      pickupEnabled: e.target.checked,
                    }))
                  }
                />
                Pickup available
              </span>
              <span className={`mt-2 block ${helperBase}`}>
                Customers can collect this order directly from your business.
              </span>
            </label>

            <label className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
              <span className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.localDeliveryEnabled}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      localDeliveryEnabled: e.target.checked,
                      useBusinessDeliveryDefaults: e.target.checked
                        ? prev.useBusinessDeliveryDefaults
                        : true,
                    }))
                  }
                />
                Local delivery available
              </span>
              <span className={`mt-2 block ${helperBase}`}>
                {businessFulfillmentDefaults.local_delivery_enabled_default
                  ? "Customers only see delivery when this listing and your business both support it."
                  : "Business delivery is off in settings, so customers will only see pickup for now."}
              </span>
            </label>
          </div>

          {form.localDeliveryEnabled ? (
            <div className="mt-6 space-y-5">
              <label className="block text-sm text-white/80">
                <span className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form.useBusinessDeliveryDefaults}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        useBusinessDeliveryDefaults: e.target.checked,
                      }))
                    }
                  />
                  Use business default delivery settings
                </span>
                <span className={`mt-2 block ${helperBase}`}>
                  Current business default fee:{" "}
                  {businessFulfillmentDefaults.default_delivery_fee_cents == null
                    ? "Not set"
                    : `$${centsToDollarsInput(
                        businessFulfillmentDefaults.default_delivery_fee_cents
                      )}`}
                </span>
              </label>

              {!form.useBusinessDeliveryDefaults ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <label className={labelBase} htmlFor="listing-delivery-fee">
                    Listing delivery fee
                  </label>
                  <input
                    id="listing-delivery-fee"
                    className={inputBase}
                    type="text"
                    inputMode="decimal"
                    placeholder="Ex: 5.00"
                    value={form.deliveryFee}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        deliveryFee: e.target.value,
                      }))
                    }
                  />
                  <p className={helperBase}>
                    This fee is added on top of the item subtotal at checkout.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
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
            className="yb-primary-button flex-1 py-4 rounded-xl text-white text-base font-semibold"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
