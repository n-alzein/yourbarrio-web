"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ListingPhotoManager from "@/components/business/listings/ListingPhotoManager";
import ListingOptionsSection from "@/components/business/listings/ListingOptionsSection";
import ListingPreviewCard from "@/components/business/listings/ListingPreviewCard";
import RichTextDescriptionEditor from "@/components/editor/RichTextDescriptionEditor";
import { useAuth } from "@/components/AuthProvider";
import {
  buildListingPhotoPayloadFromDrafts,
  convertPhotoDraftsToSavedState,
  createLocalPhotoDraft,
  getCoverPhotoDraft,
  getDraftDisplayUrl,
  orderPhotoDraftsWithCoverFirst,
  resolveCoverImageId,
} from "@/lib/listingPhotoDrafts";
import {
  describeImageFile,
  normalizeImageUpload,
  prepareEnhancementImage,
} from "@/lib/normalizeImageUpload";
import { validateImageFile } from "@/lib/storageUpload";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  centsToDollarsInput,
  dollarsInputToCents,
} from "@/lib/fulfillment";
import {
  createEmptyVariantPayload,
  deriveListingInventoryFromVariants,
  getActiveVariantQuantityTotal,
  saveListingVariants,
} from "@/lib/listingOptions";
import {
  applyFulfillmentModeToForm,
  buildListingPublicationState,
  buildListingSaveSignature,
  getFulfillmentModeFromBooleans,
  getManualInventoryState,
  getListingPublishDisabledReason,
  getListingSaveErrorMessage,
  getListingDraftTitle,
  hasMeaningfulDraftContent,
  LISTING_FULFILLMENT_MODES,
  syncInventoryFormFromQuantity,
  syncInventoryFormFromStatus,
  validateListingForPublish,
} from "@/lib/listingEditor";
import { buildListingTaxonomyPayload } from "@/lib/taxonomy/compat";
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
  const [coverImageId, setCoverImageId] = useState(null);
  const photosRef = useRef([]);
  const enhancementAttemptsRef = useRef(new Map());
  const [photoError, setPhotoError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveAction, setSaveAction] = useState(null);
  const [saveState, setSaveState] = useState("idle");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [internalListingId, setInternalListingId] = useState(null);
  const previewHref = internalListingId
    ? `/business/listings/${encodeURIComponent(internalListingId)}/preview?fromEditor=1`
    : null;
  const [fieldErrors, setFieldErrors] = useState({});
  const [hasInteracted, setHasInteracted] = useState(false);
  const [listingOptions, setListingOptions] = useState(createEmptyVariantPayload());
  const [listingOptionsErrors, setListingOptionsErrors] = useState(null);
  const autosaveTimeoutRef = useRef(null);
  const lastSavedSignatureRef = useRef(null);
  const variantsEnabled = Boolean(listingOptions?.hasOptions);
  const activeVariantTotal = getActiveVariantQuantityTotal(listingOptions?.variants);
  const derivedVariantInventory = deriveListingInventoryFromVariants(
    listingOptions?.variants,
    form.lowStockThreshold
  );

  const MAX_PHOTOS = 10;
  const UPLOAD_TIMEOUT_MS = 20000;
  const PUBLISH_TIMEOUT_MS = 20000;
  const columnSurface = "rounded-[30px] bg-white px-5 py-5 shadow-sm ring-1 ring-slate-200 sm:px-6";
  const sectionCard = "border-t border-slate-100 pt-8 first:border-t-0 first:pt-0";
  const labelBase = "text-sm font-semibold text-slate-900";
  const helperBase = "mt-2 text-xs text-slate-500";
  const inputBase =
    "mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100";
  const selectBase =
    "mt-2 h-11 w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100";

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    setCoverImageId((current) => resolveCoverImageId(photos, current));
  }, [photos]);

  useEffect(() => {
    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, []);

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
  const draftSignature = useMemo(
    () => buildListingSaveSignature({ form, photos, listingOptions, coverImageId }),
    [form, photos, listingOptions, coverImageId]
  );
  const hasDraftContent = useMemo(
    () => hasMeaningfulDraftContent({ form, photos, listingOptions }),
    [form, photos, listingOptions]
  );
  const shouldShowFieldErrors = hasInteracted || Boolean(submitError);
  const visibleFieldErrors = shouldShowFieldErrors ? publishValidation.fieldErrors : fieldErrors;
  const publishDisabledReason = getListingPublishDisabledReason(publishValidation);
  const fulfillmentMode = useMemo(
    () => getFulfillmentModeFromBooleans(form.pickupEnabled, form.localDeliveryEnabled),
    [form.localDeliveryEnabled, form.pickupEnabled]
  );
  const fulfillmentHelperText =
    fulfillmentMode === LISTING_FULFILLMENT_MODES.DELIVERY
      ? businessFulfillmentDefaults.local_delivery_enabled_default
        ? "Customers can order with local delivery only."
        : "Turn on local delivery in business settings before customers can use it."
      : fulfillmentMode === LISTING_FULFILLMENT_MODES.BOTH
        ? businessFulfillmentDefaults.local_delivery_enabled_default
          ? "Customers can choose pickup or local delivery."
          : "Delivery stays unavailable to customers until business delivery is enabled."
        : "Customers can collect this order directly from your business.";

  useEffect(() => {
    if (saveState !== "saved") return undefined;
    const timeoutId = setTimeout(() => {
      setSaveState("idle");
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [saveState]);

  useEffect(() => {
    if (!submitSuccess) return undefined;
    const timeoutId = setTimeout(() => {
      setSubmitSuccess("");
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [submitSuccess]);

  function markDirty() {
    setHasInteracted(true);
    setSubmitError("");
    setSubmitSuccess("");
    if (saveState === "saved") {
      setSaveState("idle");
    }
  }

  function updateForm(nextValue) {
    markDirty();
    setForm((prev) =>
      typeof nextValue === "function" ? nextValue(prev) : nextValue
    );
  }

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

    markDirty();
    setPhotoError("");
    setPhotos((prev) => [...prev, ...accepted].slice(0, MAX_PHOTOS));
    setCoverImageId((current) => current || accepted[0]?.id || null);
  };

  const handleRemovePhoto = (photoId) => {
    markDirty();
    enhancementAttemptsRef.current.delete(photoId);
    setPhotos((prev) => {
      const target = prev.find((photo) => photo.id === photoId);
      if (target?.status === "new" && target?.original?.previewUrl) {
        URL.revokeObjectURL(target.original.previewUrl);
      }
      return prev.filter((photo) => photo.id !== photoId);
    });
  };

  const handleSetCoverPhoto = (photoId) => {
    markDirty();
    setCoverImageId(photoId || null);
  };

  const handleBackgroundChange = (photoId, background) => {
    markDirty();
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
    markDirty();
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

  async function persistListing({ targetStatus, source }) {
    const client = getSupabaseBrowserClient() ?? supabase;
    if (!client || !accountId) {
      if (source !== "autosave") {
        setSubmitError("Connection not ready. Please try again.");
      }
      return { ok: false };
    }

    const isPublish = targetStatus === "published";
    const validation = publishValidation;

    if (!validation.listingOptionsValidation.ok) {
      setListingOptionsErrors(validation.listingOptionsValidation.errors);
      if (source !== "autosave" || isPublish) {
        setFieldErrors(validation.fieldErrors);
        setSubmitError(
          validation.fieldErrors.options || "Finish the product options section."
        );
      }
      return { ok: false };
    }

    if (isPublish && !validation.ok) {
      setFieldErrors(validation.fieldErrors);
      setSubmitError(validation.formError || "Complete the required fields before publishing.");
      return { ok: false };
    }

    setFieldErrors(isPublish ? validation.fieldErrors : {});
    setListingOptionsErrors(null);
    setSaving(true);
    setSaveAction(source);
    setSaveState("saving");
    setSubmitError("");
    if (source !== "autosave") {
      setSubmitSuccess("");
    }

    try {
      const uploadedPhotos = await withTimeout(
        uploadPhotos(),
        UPLOAD_TIMEOUT_MS * Math.max(1, photos.length),
        "Photo upload timed out. Please try again."
      );
      const savedPhotos = convertPhotoDraftsToSavedState(uploadedPhotos);
      const resolvedCoverImageId = resolveCoverImageId(savedPhotos, coverImageId);
      const orderedSavedPhotos = orderPhotoDraftsWithCoverFirst(savedPhotos, resolvedCoverImageId);
      const { photoUrls, photoVariants } = buildListingPhotoPayloadFromDrafts(orderedSavedPhotos);

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
      const manualInventory = getManualInventoryState(form);
      const inventoryStatus = validation.listingOptionsValidation.normalized.hasOptions
        ? derivedVariantInventory.inventoryStatus
        : manualInventory.inventoryStatus;
      const inventoryQuantity = validation.listingOptionsValidation.normalized.hasOptions
        ? derivedVariantInventory.inventoryQuantity
        : manualInventory.inventoryQuantity;
      const publicationState = buildListingPublicationState(targetStatus);
      const listingPayload = {
        business_id: accountId,
        title: isPublish ? form.title.trim() : getListingDraftTitle(form.title),
        description: form.description || null,
        price: form.price === "" ? null : form.price,
        listing_category: taxonomy.listing_category,
        category: taxonomy.category,
        category_id: null,
        ...publicationState,
        inventory_status: inventoryStatus,
        inventory_quantity: inventoryQuantity,
        low_stock_threshold:
          (inventoryStatus === "in_stock" || inventoryStatus === "low_stock") &&
          form.lowStockThreshold !== ""
            ? Number(form.lowStockThreshold)
            : null,
        inventory_last_updated_at: new Date().toISOString(),
        city: business?.city || null,
        cover_image_id: resolvedCoverImageId,
        photo_url: photoUrls.length ? JSON.stringify(photoUrls) : null,
        photo_variants: photoVariants.length ? photoVariants : null,
        pickup_enabled: form.pickupEnabled,
        local_delivery_enabled: form.localDeliveryEnabled,
        use_business_delivery_defaults: form.useBusinessDeliveryDefaults,
        delivery_fee_cents:
          form.localDeliveryEnabled && !form.useBusinessDeliveryDefaults
            ? validation.listingDeliveryFeeCents
            : null,
      };

      const mutation = internalListingId
        ? client
            .from("listings")
            .update(listingPayload)
            .eq("id", internalListingId)
            .eq("business_id", accountId)
            .select("id")
            .single()
        : client.from("listings").insert(listingPayload).select("id").single();

      const { data: savedListing, error } = await withTimeout(
        mutation,
        PUBLISH_TIMEOUT_MS,
        isPublish ? "Publishing timed out. Please try again." : "Saving timed out. Please try again."
      );

      if (error) {
        throw error;
      }

      if (!savedListing?.id) {
        throw new Error(isPublish ? "Listing publish did not complete." : "Draft save did not complete.");
      }

      await saveListingVariants(
        savedListing.id,
        validation.listingOptionsValidation.normalized,
        client,
        { businessId: accountId }
      );

      setInternalListingId(savedListing.id);
      setPhotos(orderedSavedPhotos);
      setCoverImageId(resolvedCoverImageId);
      lastSavedSignatureRef.current = buildListingSaveSignature({
        form,
        photos: orderedSavedPhotos,
        listingOptions,
        coverImageId: resolvedCoverImageId,
      });
      setSaveState("saved");

      if (isPublish) {
        setSubmitSuccess("Listing published! Redirecting...");
        router.push("/business/listings");
      } else if (source === "manual") {
        setSubmitSuccess("Saved");
      }

      return { ok: true, id: savedListing.id };
    } catch (err) {
      const fallbackMessage = isPublish
        ? "Failed to publish listing. Please try again."
        : "Failed to save draft. Please try again.";
      const errorMessage = getListingSaveErrorMessage(err, fallbackMessage);
      console.error(isPublish ? "Publish listing failed" : "Save draft failed", err, {
        errorMessage,
      });
      setSaveState("error");
      setSubmitError(errorMessage);
      return { ok: false };
    } finally {
      setSaving(false);
      setSaveAction(null);
    }
  }

  useEffect(() => {
    if (!hasDraftContent) return;
    if (!accountId) return;
    if (saving) return;
    if (draftSignature === lastSavedSignatureRef.current) return;

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = setTimeout(() => {
      persistListing({ targetStatus: "draft", source: "autosave" });
    }, 1500);

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [accountId, draftSignature, hasDraftContent, saving]);

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

  async function handleSaveDraft() {
    await persistListing({ targetStatus: "draft", source: "manual" });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setHasInteracted(true);
    await persistListing({ targetStatus: "published", source: "publish" });
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
      <p className="py-20 text-center text-slate-600">
        Connecting to your account...
      </p>
    );
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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
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
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Create a new listing
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Build the listing on the left and manage photos on the right.
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
                  onAddFiles={handleAddPhotos}
                  onRemovePhoto={handleRemovePhoto}
                  onEnhancePhoto={handleEnhancePhoto}
                  onChooseVariant={handleChooseVariant}
                  onBackgroundChange={handleBackgroundChange}
                  onSetCoverPhoto={handleSetCoverPhoto}
                  canAddMore={photos.length < MAX_PHOTOS}
                />
                {visibleFieldErrors.photos ? (
                  <p className="text-sm text-rose-600">{visibleFieldErrors.photos}</p>
                ) : null}
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
                      onChange={(e) =>
                        updateForm((prev) => ({ ...prev, title: e.target.value }))
                      }
                    />
                    {visibleFieldErrors.title ? (
                      <p className="mt-2 text-sm text-rose-600">{visibleFieldErrors.title}</p>
                    ) : null}
                  </div>

                  <div>
                    <RichTextDescriptionEditor
                      label="Description"
                      value={form.description}
                      onChange={(nextDescription) =>
                        updateForm((prev) => ({ ...prev, description: nextDescription }))
                      }
                      minHeight={180}
                      placeholder=""
                      helpText="Use headings, bullets, and links to make details easy to scan."
                    />
                    {visibleFieldErrors.description ? (
                      <p className="mt-2 text-sm text-rose-600">{visibleFieldErrors.description}</p>
                    ) : null}
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
                          updateForm((prev) => ({ ...prev, category: e.target.value }))
                        }
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
                      {visibleFieldErrors.category ? (
                        <p className="mt-2 text-sm text-rose-600">{visibleFieldErrors.category}</p>
                      ) : null}
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
                        onChange={(e) =>
                          updateForm((prev) => ({ ...prev, price: e.target.value }))
                        }
                      />
                      <p className={helperBase}>Use numbers only. Currency is USD.</p>
                      {visibleFieldErrors.price ? (
                        <p className="mt-2 text-sm text-rose-600">{visibleFieldErrors.price}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>

              <section className={sectionCard}>
                <ListingOptionsSection
                  value={listingOptions}
                  basePrice={form.price}
                  onChange={(nextValue) => {
                    markDirty();
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
                {visibleFieldErrors.options ? (
                  <p className="mt-3 text-sm text-rose-600">{visibleFieldErrors.options}</p>
                ) : null}
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
                          updateForm((prev) => syncInventoryFormFromStatus(prev, e.target.value));
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
                            updateForm((prev) => syncInventoryFormFromQuantity(prev, e.target.value))
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
                        updateForm((prev) => ({
                          ...prev,
                          lowStockThreshold: e.target.value,
                        }))
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
                            updateForm((prev) => applyFulfillmentModeToForm(prev, segment.value))
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
                            updateForm((prev) => ({
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
                            updateForm((prev) => ({
                              ...prev,
                              deliveryFee: e.target.value,
                            }))
                          }
                        />
                        <p className={helperBase}>
                          This fee is added on top of the item subtotal at checkout.
                        </p>
                        {visibleFieldErrors.deliveryFee ? (
                          <p className="mt-2 text-sm text-rose-600">{visibleFieldErrors.deliveryFee}</p>
                        ) : null}
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
                  {!submitError && saveState === "saving" ? (
                    <p className="text-slate-500">Saving...</p>
                  ) : null}
                  {!submitError && saveState !== "saving" && submitSuccess ? (
                    <p className="text-emerald-600">{submitSuccess}</p>
                  ) : null}
                  {!submitError && !submitSuccess && saveState === "saved" ? (
                    <p className="text-emerald-600">Saved</p>
                  ) : null}
                  {!submitError &&
                  saveState !== "saving" &&
                  !submitSuccess &&
                  !previewHref ? (
                    <p className="text-slate-500">Save draft first to preview latest changes.</p>
                  ) : null}
                  {!submitError && saveState !== "saving" && !submitSuccess && saveState !== "saved" && !publishValidation.ok ? (
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
                  ) : (
                    <button
                      type="button"
                      disabled
                      title="Save draft first to preview latest changes."
                      className="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-400 disabled:cursor-not-allowed"
                    >
                      Preview listing
                    </button>
                  )}
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
                    {saving && saveAction === "publish" ? "Publishing..." : "Publish listing"}
                  </button>
                </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
