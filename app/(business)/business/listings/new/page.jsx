"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ListingPhotoManager from "@/components/business/listings/ListingPhotoManager";
import RichTextDescriptionEditor from "@/components/editor/RichTextDescriptionEditor";
import { useAuth } from "@/components/AuthProvider";
import { stripHtmlToText } from "@/lib/listingDescription";
import {
  buildListingPhotoPayloadFromDrafts,
  createLocalPhotoDraft,
} from "@/lib/listingPhotoDrafts";
import { normalizeImageUpload } from "@/lib/normalizeImageUpload";
import { validateImageFile } from "@/lib/storageUpload";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  centsToDollarsInput,
  dollarsInputToCents,
} from "@/lib/fulfillment";
import { buildListingTaxonomyPayload } from "@/lib/taxonomy/compat";
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

export default function NewListingPage() {
  const { supabase, user, profile, loadingUser } = useAuth();
  const router = useRouter();
  const accountId = user?.id || profile?.id || null;

  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    category: "",
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
      setForm((prev) => ({
        ...prev,
        pickupEnabled: data.pickup_enabled_default !== false,
        localDeliveryEnabled: data.local_delivery_enabled_default === true,
      }));
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, supabase]);

  const handleAddPhotos = async (files, inputMeta = {}) => {
    const incoming = Array.from(files || []);
    if (!incoming.length) return;

    const accepted = [];
    for (const file of incoming) {
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
    setPhotos((prev) => [...prev, ...accepted].slice(0, MAX_PHOTOS));
  };

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
    for (const photo of photos) {
      if (photo.status !== "new" || !photo.original.file) {
        uploaded.push(photo);
        continue;
      }

      const file = photo.original.file;
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

    if (!form.category) {
      setSubmitError("Please select a category.");
      return;
    }
    if (!stripHtmlToText(form.description || "").trim()) {
      setSubmitError("Please add a description.");
      return;
    }
    if (
      form.localDeliveryEnabled &&
      form.useBusinessDeliveryDefaults &&
      businessFulfillmentDefaults.default_delivery_fee_cents == null
    ) {
      setSubmitError("Add a default delivery fee in business settings before enabling delivery.");
      return;
    }
    const listingDeliveryFeeCents = dollarsInputToCents(form.deliveryFee);
    if (
      form.localDeliveryEnabled &&
      !form.useBusinessDeliveryDefaults &&
      (Number.isNaN(listingDeliveryFeeCents) || listingDeliveryFeeCents === null)
    ) {
      setSubmitError("Enter a valid listing delivery fee.");
      return;
    }

    setSaving(true);

    try {
      const uploadedPhotos = await withTimeout(
        uploadPhotos(),
        UPLOAD_TIMEOUT_MS * Math.max(1, photos.length),
        "Photo upload timed out. Please try again."
      );
      const { photoUrls, photoVariants } = buildListingPhotoPayloadFromDrafts(uploadedPhotos);

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

      const taxonomy = buildListingTaxonomyPayload({
        listing_category: form.category,
      });
      const listingPayload = {
        // public_id is intentionally omitted; DB default/trigger generates it.
        business_id: accountId,
        title: form.title,
        description: form.description,
        price: form.price,
        listing_category: taxonomy.listing_category,
        category: taxonomy.category,
        category_id: null,
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
        photo_url: photoUrls.length ? JSON.stringify(photoUrls) : null,
        photo_variants: photoVariants.length ? photoVariants : null,
        pickup_enabled: form.pickupEnabled,
        local_delivery_enabled: form.localDeliveryEnabled,
        use_business_delivery_defaults: form.useBusinessDeliveryDefaults,
        delivery_fee_cents:
          form.localDeliveryEnabled && !form.useBusinessDeliveryDefaults
            ? listingDeliveryFeeCents
            : null,
      };
      const insertQuery = client.from("listings").insert(listingPayload);
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
        <ListingPhotoManager
          photos={photos}
          maxPhotos={MAX_PHOTOS}
          helperText={`Add up to ${MAX_PHOTOS} photos. The first photo becomes the cover.`}
          error={photoError}
          onAddFiles={handleAddPhotos}
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
                placeholder=""
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

        <section className={sectionCard}>
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white">Fulfillment</h2>
            <p className="text-sm text-white/60">
              Pickup is the default. Only offer delivery when you can fulfill it reliably.
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
                  ? "Customers only see delivery when this listing also supports it."
                  : "Turn on local delivery in business settings before customers can use it."}
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
