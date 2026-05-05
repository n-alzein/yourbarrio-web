"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import AIDescriptionAssistant from "@/components/business/AIDescriptionAssistant";
import ListingPhotoManager from "@/components/business/listings/ListingPhotoManager";
import ListingOptionsSection from "@/components/business/listings/ListingOptionsSection";
import ListingPreviewCard from "@/components/business/listings/ListingPreviewCard";
import { useAuth } from "@/components/AuthProvider";
import RichTextDescriptionEditor from "@/components/editor/RichTextDescriptionEditor";
import {
  buildListingPhotoPayloadFromDrafts,
  convertPhotoDraftsToSavedState,
  createLocalPhotoDraft,
  getCoverPhotoDraft,
  getDraftDisplayUrl,
  hydratePhotoDrafts,
  orderPhotoDraftsWithCoverFirst,
  resolveCoverImageId,
} from "@/lib/listingPhotoDrafts";
import {
  describeImageFile,
  normalizeImageUpload,
  prepareEnhancementImage,
} from "@/lib/normalizeImageUpload";
import { retry } from "@/lib/retry";
import { validateImageFile } from "@/lib/storageUpload";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import {
  dollarsInputToCents,
  centsToDollarsInput,
} from "@/lib/fulfillment";
import {
  createEmptyVariantPayload,
  deriveListingInventoryFromVariants,
  getActiveVariantQuantityTotal,
  saveListingVariants,
} from "@/lib/listingOptions";
import {
  applyFulfillmentModeToForm,
  buildListingDraftData,
  buildListingPublicationState,
  formatListingPriceInput,
  getFulfillmentModeFromBooleans,
  getManualInventoryState,
  getListingPublishDisabledReason,
  getListingDraftTitle,
  getListingSaveErrorMessage,
  LISTING_FULFILLMENT_MODES,
  syncInventoryFormFromQuantity,
  syncInventoryFormFromStatus,
  validateListingForPublish,
} from "@/lib/listingEditor";
import {
  buildListingTaxonomyPayload,
  getListingCategorySlug,
} from "@/lib/taxonomy/compat";
import { fetchListingCategoryBySlug } from "@/lib/taxonomy/db";
import { getListingCategoryOptions } from "@/lib/taxonomy/listingCategories";

const CATEGORY_OPTIONS = getListingCategoryOptions();
const FULFILLMENT_SEGMENTS = [
  { value: LISTING_FULFILLMENT_MODES.PICKUP, label: "Pickup" },
  { value: LISTING_FULFILLMENT_MODES.DELIVERY, label: "Delivery" },
  { value: LISTING_FULFILLMENT_MODES.BOTH, label: "Both" },
];

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
  const previewHref = listingRef
    ? `/business/listings/${encodeURIComponent(listingRef)}/preview?fromEditor=1`
    : null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveAction, setSaveAction] = useState(null);
  const MAX_PHOTOS = 10;
  const columnSurface = "rounded-[30px] bg-white px-5 py-5 shadow-sm ring-1 ring-slate-200 sm:px-6";
  const sectionCard = "border-t border-slate-100 pt-8 first:border-t-0 first:pt-0";
  const labelBase = "text-sm font-semibold text-slate-900";
  const helperBase = "mt-2 text-xs text-slate-500";
  const inputBase =
    "mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100";
  const selectBase =
    "mt-2 h-11 w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100";

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
  const [coverImageId, setCoverImageId] = useState(null);
  const photosRef = useRef([]);
  const enhancementAttemptsRef = useRef(new Map());
  const [photoError, setPhotoError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [internalListingId, setInternalListingId] = useState(null);
  const [listingStatus, setListingStatus] = useState("draft");
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false);
  const [listingOptions, setListingOptions] = useState(createEmptyVariantPayload());
  const [listingOptionsErrors, setListingOptionsErrors] = useState(null);
  const variantsEnabled = Boolean(listingOptions?.hasOptions);
  const activeVariantTotal = getActiveVariantQuantityTotal(listingOptions?.variants);
  const derivedVariantInventory = deriveListingInventoryFromVariants(
    listingOptions?.variants,
    form.lowStockThreshold
  );
  const publishValidation = useMemo(
    () =>
      validateListingForPublish({
        form,
        photos,
        businessFulfillmentDefaults,
        listingOptions,
        dollarsInputToCents,
      }),
    [form, photos, businessFulfillmentDefaults, listingOptions]
  );
  const publishDisabledReason = getListingPublishDisabledReason(publishValidation);
  const fulfillmentMode = useMemo(
    () => getFulfillmentModeFromBooleans(form.pickupEnabled, form.localDeliveryEnabled),
    [form.localDeliveryEnabled, form.pickupEnabled]
  );
  const fulfillmentHelperText =
    fulfillmentMode === LISTING_FULFILLMENT_MODES.DELIVERY
      ? businessFulfillmentDefaults.local_delivery_enabled_default
        ? "Customers can order with local delivery only."
        : "Business delivery is off in settings, so customers will only see pickup for now."
      : fulfillmentMode === LISTING_FULFILLMENT_MODES.BOTH
        ? businessFulfillmentDefaults.local_delivery_enabled_default
          ? "Customers can choose pickup or local delivery."
          : "Delivery stays unavailable to customers until business delivery is enabled."
        : "Customers can collect this order directly from your business.";

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    setCoverImageId((current) => resolveCoverImageId(photos, current));
  }, [photos]);

  useEffect(() => {
    if (!submitSuccess) return undefined;
    const timeoutId = setTimeout(() => {
      setSubmitSuccess("");
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [submitSuccess]);

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
        setListingStatus(
          String(data.status || "").trim().toLowerCase() === "published" || data.is_published === true
            ? "published"
            : "draft"
        );
        setHasUnpublishedChanges(data.has_unpublished_changes === true);

        setForm({
          title: data.title || "",
          description: data.description || "",
          price: formatListingPriceInput(data.price),
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
        const hydratedPhotos = hydratePhotoDrafts(data.photo_url, data.photo_variants);
        setPhotos(hydratedPhotos);
        setCoverImageId(resolveCoverImageId(hydratedPhotos, data.cover_image_id));
        setListingOptions(payload?.listingOptions || createEmptyVariantPayload());
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
      accepted.push(
        createLocalPhotoDraft(normalizedFile, {
          source,
          normalization: {
            converted: normalizedFile !== file,
            raw: describeImageFile(file),
            normalized: describeImageFile(normalizedFile),
          },
        })
      );
    }

    if (!accepted.length) return;

    setPhotoError("");
    setPhotos((prev) => [...prev, ...accepted]);
    setCoverImageId((current) => current || accepted[0]?.id || null);
  };

  const handleSetCoverPhoto = (photoId) => {
    setCoverImageId(photoId || null);
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
    enhancementAttemptsRef.current.delete(photoId);
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
    const target = photosRef.current.find((photo) => photo.id === photoId);
    if (!target?.original?.file) return;
    const attemptCount = (enhancementAttemptsRef.current.get(photoId) || 0) + 1;
    enhancementAttemptsRef.current.set(photoId, attemptCount);

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
      const prepared = await prepareEnhancementImage(target.original.file, {
        source: target.source || "unknown",
        inputControl: "listing-photo-primary",
      });
      const formData = new FormData();
      formData.append("image", prepared.file, prepared.file.name || "listing-photo.jpg");
      formData.append("background", target.enhancement.background);
      formData.append("imageSource", target.source || "unknown");
      formData.append("imageNormalized", String(Boolean(target.normalization?.converted)));
      formData.append("enhancementAttempt", String(attemptCount));
      if (prepared.dimensions?.width) formData.append("imageWidth", String(prepared.dimensions.width));
      if (prepared.dimensions?.height) formData.append("imageHeight", String(prepared.dimensions.height));
      if (prepared.optimizedDimensions?.width) {
        formData.append("optimizedWidth", String(prepared.optimizedDimensions.width));
      }
      if (prepared.optimizedDimensions?.height) {
        formData.append("optimizedHeight", String(prepared.optimizedDimensions.height));
      }

      logListingPhotoDebug("enhance.request", {
        source: target.source || "unknown",
        selectedFileName: target.original.file.name || null,
        selectedFileType: target.original.file.type || null,
        selectedFileSize: typeof target.original.file.size === "number" ? target.original.file.size : null,
        normalized: Boolean(target.normalization?.converted),
        normalizedFileName: target.normalization?.normalized?.name || target.original.file.name || null,
        normalizedFileType: target.normalization?.normalized?.type || target.original.file.type || null,
        normalizedFileSize: target.normalization?.normalized?.size || target.original.file.size || null,
        enhancementInputName: prepared.file.name || null,
        enhancementInputType: prepared.file.type || null,
        enhancementInputSize: typeof prepared.file.size === "number" ? prepared.file.size : null,
        imageWidth: prepared.dimensions?.width || null,
        imageHeight: prepared.dimensions?.height || null,
        optimizedForEnhancement: prepared.optimized,
        optimizedWidth: prepared.optimizedDimensions?.width || null,
        optimizedHeight: prepared.optimizedDimensions?.height || null,
        previewSource: target.original.previewUrl ? "object-url" : "none",
        attemptCount,
        isRetry: attemptCount > 1,
        sameFileSentUpstream:
          prepared.file === target.original.file ||
          describeImageFile(prepared.file)?.name === describeImageFile(target.original.file)?.name,
      });

      const response = await fetch("/api/images/enhance", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok || !payload?.ok || !payload?.image?.publicUrl || payload?.image?.isFallbackOriginal) {
        if (process.env.NODE_ENV !== "production") {
          logListingPhotoDebug("enhance.error", {
            source: target.source || "unknown",
            attemptCount,
            status: response.status,
            code: payload?.error?.code || null,
            debug: payload?.debug || null,
          });
        }
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
        attemptCount,
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
      if (process.env.NODE_ENV !== "production") {
        logListingPhotoDebug("enhance.catch", {
          source: target.source || "unknown",
          attemptCount,
          message: error?.message || "unknown",
        });
      }
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

  async function persistListing(targetStatus) {
    const client = getSupabaseBrowserClient() ?? supabase;
    if (!client || !accountId) {
      setSubmitError("Connection not ready. Please try again.");
      return { ok: false };
    }

    const isPublish = targetStatus === "published";
    if (!publishValidation.listingOptionsValidation.ok) {
      setListingOptionsErrors(publishValidation.listingOptionsValidation.errors);
      setSubmitError(
        publishValidation.fieldErrors.options ||
          "Finish the product options section before saving."
      );
      return { ok: false };
    }
    if (isPublish && !publishValidation.ok) {
      setSubmitError(
        publishValidation.formError || "Complete the required fields before publishing."
      );
      return { ok: false };
    }

    setListingOptionsErrors(null);
    setSubmitError("");
    setSubmitSuccess("");
    setSaving(true);
    setSaveAction(targetStatus);
    const resetTimer = setTimeout(() => setSaving(false), 20000);

    try {
      const uploaded = await uploadNewPhotos();
      const savedPhotos = convertPhotoDraftsToSavedState(uploaded);
      const resolvedCoverImageId = resolveCoverImageId(savedPhotos, coverImageId);
      const orderedSavedPhotos = orderPhotoDraftsWithCoverFirst(savedPhotos, resolvedCoverImageId);
      const { photoUrls, photoVariants } = buildListingPhotoPayloadFromDrafts(orderedSavedPhotos);
      const taxonomy = buildListingTaxonomyPayload({
        listing_category: form.category,
      });
      const listingCategory = await fetchListingCategoryBySlug(client, taxonomy.category);
      const resolvedTaxonomy = {
        ...taxonomy,
        listing_category_id: listingCategory?.id || null,
        listing_category: listingCategory?.name || taxonomy.listing_category,
        category: listingCategory?.slug || taxonomy.category,
      };
      const inventoryStatus = publishValidation.listingOptionsValidation.normalized.hasOptions
        ? derivedVariantInventory.inventoryStatus
        : getManualInventoryState(form).inventoryStatus;
      const inventoryQuantity = publishValidation.listingOptionsValidation.normalized.hasOptions
        ? derivedVariantInventory.inventoryQuantity
        : getManualInventoryState(form).inventoryQuantity;
      const publicationState = buildListingPublicationState(targetStatus);
      const basePayload = {
        title: isPublish ? (form.title || "").trim() : getListingDraftTitle(form.title),
        description: form.description || "",
        price: form.price === "" ? null : form.price,
        listing_category: resolvedTaxonomy.listing_category,
        category: resolvedTaxonomy.category,
        listing_category_id: resolvedTaxonomy.listing_category_id,
        category_id: null,
        city: form.city,
        ...publicationState,
        cover_image_id: resolvedCoverImageId,
        inventory_status: inventoryStatus,
        inventory_quantity: inventoryQuantity,
        low_stock_threshold:
          (inventoryStatus === "in_stock" || inventoryStatus === "low_stock") &&
          form.lowStockThreshold !== ""
            ? Number(form.lowStockThreshold)
            : null,
        inventory_last_updated_at: new Date().toISOString(),
        photo_url: photoUrls.length ? JSON.stringify(photoUrls) : null,
        photo_variants: photoVariants.length ? photoVariants : null,
        pickup_enabled: form.pickupEnabled,
        local_delivery_enabled: form.localDeliveryEnabled,
        use_business_delivery_defaults: form.useBusinessDeliveryDefaults,
        delivery_fee_cents:
          form.localDeliveryEnabled && !form.useBusinessDeliveryDefaults
            ? publishValidation.listingDeliveryFeeCents
            : null,
      };
      const isPublishedListing = listingStatus === "published";
      const draftData = buildListingDraftData({
        form,
        taxonomy: resolvedTaxonomy,
        resolvedCoverImageId,
        inventoryStatus,
        inventoryQuantity,
        lowStockThreshold:
          (inventoryStatus === "in_stock" || inventoryStatus === "low_stock") &&
          form.lowStockThreshold !== ""
            ? Number(form.lowStockThreshold)
            : null,
        photoUrls,
        photoVariants,
        listingDeliveryFeeCents: publishValidation.listingDeliveryFeeCents,
        listingOptions: publishValidation.listingOptionsValidation.normalized,
      });
      const payload =
        !isPublish && isPublishedListing
          ? {
              draft_data: draftData,
              has_unpublished_changes: true,
            }
          : {
              ...basePayload,
              draft_data: null,
              has_unpublished_changes: false,
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

      if (isPublish || listingStatus !== "published") {
        await saveListingVariants(
          data.id,
          publishValidation.listingOptionsValidation.normalized,
          client,
          { businessId: accountId }
        );
      }

      setPhotos(orderedSavedPhotos);
      setCoverImageId(resolvedCoverImageId);
      setListingStatus(isPublish ? publicationState.status : listingStatus);
      setHasUnpublishedChanges(!isPublish && isPublishedListing);
      if (isPublish) {
        setSubmitSuccess(
          listingStatus === "published" ? "Changes published! Redirecting..." : "Listing published! Redirecting..."
        );
        router.push("/business/listings");
      } else {
        setSubmitSuccess(isPublishedListing ? "Draft saved" : "Saved");
      }
      return { ok: true };
    } catch (err) {
      const fallbackMessage = isPublish
        ? "Failed to publish listing. Please try again."
        : "Failed to save changes. Please try again.";
      const errorMessage = getListingSaveErrorMessage(err, fallbackMessage);
      console.error("❌ Update error:", err, { errorMessage });
      setSubmitError(errorMessage);
      return { ok: false };
    } finally {
      clearTimeout(resetTimer);
      setSaving(false);
      setSaveAction(null);
    }
  }

  async function handleSaveDraft() {
    await persistListing("draft");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await persistListing("published");
  }

  if (loading) {
    return <div className="py-20 text-center text-slate-600">Loading listing...</div>;
  }

  if (loadingUser && !accountId) {
    return <div className="py-20 text-center text-slate-600">Loading account...</div>;
  }

  if (!accountId) {
    return <div className="py-20 text-center text-slate-600">Redirecting to login...</div>;
  }

  if (!supabase && !getSupabaseBrowserClient()) {
    return <div className="py-20 text-center text-slate-600">Connecting to your account...</div>;
  }

  const previewCategoryLabel =
    CATEGORY_OPTIONS.find((category) => category.slug === form.category)?.label || "";
  const previewManualInventory = getManualInventoryState(form);
  const previewInventoryStatus = variantsEnabled
    ? derivedVariantInventory.inventoryStatus
    : previewManualInventory.inventoryStatus;
  const previewInventoryQuantity = variantsEnabled
    ? derivedVariantInventory.inventoryQuantity
    : previewManualInventory.inventoryQuantity;
  const previewImageUrl = getDraftDisplayUrl(getCoverPhotoDraft(photos, coverImageId));

  // -------------------------------------------------------------------------
  // UI
  // -------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-0 sm:px-6 lg:px-8 lg:pb-10">
        <div className="mb-8">
          <button
            type="button"
            onClick={() => router.push("/business/listings")}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 underline-offset-4 transition hover:text-slate-900 hover:underline"
            disabled={saving}
            data-testid="listing-editor-exit"
          >
            ← Back to listings
          </button>
          <div className="mt-6 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-700">
              Business listings
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Edit listing
              </h1>
              {listingStatus === "draft" ? (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Draft
                </span>
              ) : null}
              {listingStatus === "published" && hasUnpublishedChanges ? (
                <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
                  Changes not published
                </span>
              ) : null}
            </div>
            <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Refine the listing on the left and manage photos on the right.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
            <div className="order-1 space-y-6 lg:order-2 lg:col-span-5">
              <div className={`space-y-8 lg:sticky lg:top-24 ${columnSurface}`}>
                <ListingPhotoManager
                  photos={photos}
                  coverImageId={coverImageId}
                  maxPhotos={MAX_PHOTOS}
                  helperText={`Choose a cover photo — this is what customers see first.`}
                  error={photoError}
                  onAddFiles={handleAddNewPhotos}
                  onRemovePhoto={handleRemovePhoto}
                  onEnhancePhoto={handleEnhancePhoto}
                  onChooseVariant={handleChooseVariant}
                  onBackgroundChange={handleBackgroundChange}
                  onSetCoverPhoto={handleSetCoverPhoto}
                  canAddMore={photos.length < MAX_PHOTOS}
                />
                <div className="pt-1 sm:pt-2">
                  <ListingPreviewCard
                    title={form.title}
                    price={form.price}
                    category={previewCategoryLabel}
                    imageUrl={previewImageUrl}
                    inventoryStatus={previewInventoryStatus}
                    inventoryQuantity={previewInventoryQuantity}
                    lowStockThreshold={form.lowStockThreshold}
                    variants={listingOptions?.variants}
                  />
                </div>
              </div>
            </div>

            <div className="order-2 space-y-6 lg:order-1 lg:col-span-7">
              <div className={`${columnSurface} space-y-6`}>
              <section className={sectionCard}>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-slate-900">Basic info</h2>
                </div>
                <div className="grid gap-4">
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
                    <AIDescriptionAssistant
                      type="listing"
                      name={form.title}
                      category={form.category}
                      value={form.description}
                      targetId={internalListingId || listingRef || undefined}
                      onApply={(description) =>
                        setForm((prev) => ({ ...prev, description }))
                      }
                      context="listing-editor"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
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
                <ListingOptionsSection
                  value={listingOptions}
                  basePrice={form.price}
                  onChange={(nextValue) => {
                    setListingOptions(nextValue);
                    if (listingOptionsErrors) {
                      setListingOptionsErrors(null);
                    }
                  }}
                  onBeforeDisable={(currentValue) => {
                    const hasExistingVariants =
                      Array.isArray(currentValue?.attributes) && currentValue.attributes.length > 0;
                    if (!hasExistingVariants) return true;
                    return window.confirm(
                      "Turn off product options? This will remove the existing options and variants for this listing."
                    );
                  }}
                  errors={listingOptionsErrors}
                />
              </section>

              <section className={sectionCard}>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-slate-900">Inventory</h2>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={labelBase} htmlFor="listing-status">
                      Availability
                    </label>
                    {variantsEnabled ? (
                      <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                        {derivedVariantInventory.inventoryStatus === "out_of_stock"
                          ? "Out of stock"
                          : derivedVariantInventory.inventoryStatus === "low_stock"
                            ? "Low stock"
                            : "In stock"}
                      </div>
                    ) : (
                      <select
                        id="listing-status"
                        className={selectBase}
                        value={form.inventoryStatus}
                        onChange={(e) => {
                          setForm((prev) => syncInventoryFormFromStatus(prev, e.target.value));
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
                    )}
                  </div>

                  <div>
                    <label className={labelBase} htmlFor="listing-quantity">
                      Quantity on hand
                    </label>
                    {variantsEnabled ? (
                      <>
                        <div
                          id="listing-quantity"
                          className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                        >
                          Inventory is managed per variant above. Total available: {activeVariantTotal}.
                        </div>
                      </>
                    ) : (
                      <>
                        <input
                          id="listing-quantity"
                          className={inputBase}
                          type="number"
                          min="0"
                          step="1"
                          placeholder="Ex: 20"
                          value={form.inventoryQuantity}
                          onChange={(e) =>
                            setForm((prev) => syncInventoryFormFromQuantity(prev, e.target.value))
                          }
                        />
                      </>
                    )}
                  </div>
                </div>

                {(variantsEnabled || form.inventoryStatus === "in_stock") && (
                  <div className="mt-4">
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
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-slate-900">Fulfillment</h2>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-2">
                  <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Fulfillment method">
                    {FULFILLMENT_SEGMENTS.map((segment) => {
                      const selected = fulfillmentMode === segment.value;
                      return (
                        <button
                          key={segment.value}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          onClick={() =>
                            setForm((prev) => applyFulfillmentModeToForm(prev, segment.value))
                          }
                          className={`h-11 rounded-2xl border text-sm font-semibold transition ${
                            selected
                              ? "border-violet-200 bg-violet-50 text-violet-700"
                              : "border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                          }`}
                        >
                          {segment.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className={helperBase}>{fulfillmentHelperText}</p>
                </div>

                {form.localDeliveryEnabled ? (
                  <div className="mt-4 space-y-3">
                    <label className="block rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                      <span className="flex items-center gap-3 font-medium text-slate-900">
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
                      <span className={`block ${helperBase}`}>
                        Current business default fee:{" "}
                        {businessFulfillmentDefaults.default_delivery_fee_cents == null
                          ? "Not set"
                          : `$${centsToDollarsInput(
                              businessFulfillmentDefaults.default_delivery_fee_cents
                            )}`}
                      </span>
                    </label>

                    {!form.useBusinessDeliveryDefaults ? (
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
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
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <div className="flex flex-col gap-4 sm:items-end">
                <div
                  className="min-h-[1.25rem] text-sm text-right"
                  data-testid="listing-editor-action-status"
                >
                  {submitError ? (
                    <p role="alert" className="text-rose-600">
                      {submitError}
                    </p>
                  ) : null}
                  {!submitError && saving ? (
                    <p className="text-slate-500">Saving...</p>
                  ) : null}
                  {!submitError && !saving && submitSuccess ? (
                    <p className="text-emerald-600">{submitSuccess}</p>
                  ) : null}
                  {!submitError &&
                  !saving &&
                  !submitSuccess &&
                  listingStatus === "published" &&
                  hasUnpublishedChanges ? (
                    <p className="text-violet-600">Saved changes are not public until you publish them.</p>
                  ) : null}
                  {!submitError && !saving && !submitSuccess && previewHref ? (
                    <p className="text-slate-500">Preview shows your latest saved changes.</p>
                  ) : null}
                  {!submitError && !saving && !submitSuccess && !publishValidation.ok ? (
                    <p className="text-slate-500">{publishDisabledReason}</p>
                  ) : null}
                </div>
                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                  {previewHref ? (
                    <a
                      href={previewHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                    >
                      Preview listing
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={saving}
                    className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Save draft
                  </button>

                  <button
                    type="submit"
                    disabled={saving || !publishValidation.ok}
                    className="yb-primary-button rounded-full px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving && saveAction === "published"
                      ? "Publishing..."
                      : listingStatus === "published"
                        ? "Publish changes"
                        : "Publish listing"}
                  </button>
                </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
