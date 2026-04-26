import { stripHtmlToText } from "@/lib/listingDescription";
import { validateListingOptions } from "@/lib/listingOptions";

export const LISTING_DRAFT_TITLE = "Untitled draft";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePublishPrice(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Number(parsed.toFixed(2));
  return rounded > 0 ? rounded : null;
}

function normalizeInventoryQuantityInput(value) {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "";
  return String(Math.max(0, Math.trunc(parsed)));
}

function normalizeInventoryQuantityNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.trunc(parsed));
}

function isCountTrackedInventoryStatus(status) {
  return status === "in_stock" || status === "low_stock";
}

export function syncInventoryFormFromQuantity(form, nextQuantityValue) {
  const normalizedQuantity = normalizeInventoryQuantityInput(nextQuantityValue);
  const normalizedQuantityNumber = normalizeInventoryQuantityNumber(normalizedQuantity);
  const nextForm = {
    ...form,
    inventoryQuantity: normalizedQuantity,
  };

  if (normalizedQuantityNumber === 0) {
    nextForm.inventoryStatus = "out_of_stock";
    return nextForm;
  }

  if (normalizedQuantityNumber && form?.inventoryStatus === "out_of_stock") {
    nextForm.inventoryStatus = "in_stock";
  }

  return nextForm;
}

export function syncInventoryFormFromStatus(form, nextStatus) {
  const normalizedStatus = String(nextStatus || "").trim() || "in_stock";
  const nextForm = {
    ...form,
    inventoryStatus: normalizedStatus,
  };

  if (normalizedStatus === "out_of_stock") {
    nextForm.inventoryQuantity = "0";
    nextForm.lowStockThreshold = "";
    return nextForm;
  }

  if (normalizedStatus === "in_stock") {
    return nextForm;
  }

  if (normalizedStatus === "always_available" || normalizedStatus === "seasonal") {
    nextForm.lowStockThreshold = "";
  }

  return nextForm;
}

export function getManualInventoryState(form) {
  const inventoryStatus = String(form?.inventoryStatus || "in_stock").trim() || "in_stock";
  const inventoryQuantity =
    form?.inventoryQuantity === ""
      ? null
      : normalizeInventoryQuantityNumber(form?.inventoryQuantity);

  return {
    inventoryStatus,
    inventoryQuantity,
  };
}

function serializePhotosForSave(photos) {
  return (photos || []).map((photo) => ({
    id: photo?.id || null,
    status: photo?.status || null,
    selectedVariant: photo?.selectedVariant || "original",
    original: {
      name: photo?.original?.name || photo?.original?.file?.name || null,
      path: photo?.original?.path || null,
      publicUrl: photo?.original?.publicUrl || null,
      previewUrl: photo?.original?.previewUrl || null,
      fileSize:
        typeof photo?.original?.file?.size === "number" ? photo.original.file.size : null,
      lastModified:
        typeof photo?.original?.file?.lastModified === "number"
          ? photo.original.file.lastModified
          : null,
    },
    enhanced: photo?.enhanced
      ? {
          publicUrl: photo.enhanced.publicUrl || null,
          path: photo.enhanced.path || null,
          background: photo.enhanced.background || "white",
        }
      : null,
  }));
}

export function buildListingSaveSignature({ form, photos, listingOptions, coverImageId }) {
  return JSON.stringify({
    form: {
      title: form?.title || "",
      description: form?.description || "",
      price: form?.price || "",
      category: form?.category || "",
      inventoryQuantity: form?.inventoryQuantity ?? "",
      inventoryStatus: form?.inventoryStatus || "in_stock",
      lowStockThreshold: form?.lowStockThreshold ?? "",
      pickupEnabled: form?.pickupEnabled !== false,
      localDeliveryEnabled: form?.localDeliveryEnabled === true,
      useBusinessDeliveryDefaults: form?.useBusinessDeliveryDefaults !== false,
      deliveryFee: form?.deliveryFee || "",
      city: form?.city || "",
    },
    coverImageId: coverImageId || null,
    photos: serializePhotosForSave(photos),
    listingOptions: listingOptions || null,
  });
}

export function formatListingPriceInput(value) {
  const normalizedPrice = normalizePublishPrice(value);
  return normalizedPrice === null ? "" : String(normalizedPrice);
}

export function hasMeaningfulDraftContent({ form, photos, listingOptions }) {
  if ((photos || []).length > 0) return true;
  if (normalizeText(form?.title)) return true;
  if (normalizeText(stripHtmlToText(form?.description || ""))) return true;
  if (normalizeText(form?.price)) return true;
  if (normalizeText(form?.category)) return true;
  if (normalizeText(String(form?.inventoryQuantity ?? ""))) return true;
  if (normalizeText(String(form?.lowStockThreshold ?? ""))) return true;
  if (normalizeText(form?.deliveryFee)) return true;
  if (listingOptions?.hasOptions) return true;
  return false;
}

export function getListingDraftTitle(title) {
  return normalizeText(title) || LISTING_DRAFT_TITLE;
}

export function buildListingPublicationState(targetStatus) {
  const normalizedStatus =
    String(targetStatus || "").trim().toLowerCase() === "published"
      ? "published"
      : "draft";

  return {
    status: normalizedStatus,
  };
}

export function buildListingDraftData({
  form,
  taxonomy,
  resolvedCoverImageId,
  inventoryStatus,
  inventoryQuantity,
  lowStockThreshold,
  photoUrls,
  photoVariants,
  listingDeliveryFeeCents,
  listingOptions,
}) {
  return {
    title: normalizeText(form?.title) || LISTING_DRAFT_TITLE,
    description: form?.description || "",
    price: form?.price === "" ? null : form?.price ?? null,
    listing_category: taxonomy?.listing_category || null,
    category: taxonomy?.category || null,
    category_id: null,
    city: form?.city || "",
    cover_image_id: resolvedCoverImageId || null,
    inventory_status: inventoryStatus || "in_stock",
    inventory_quantity: inventoryQuantity,
    low_stock_threshold: lowStockThreshold,
    photo_url: photoUrls?.length ? JSON.stringify(photoUrls) : null,
    photo_variants: photoVariants?.length ? photoVariants : null,
    pickup_enabled: form?.pickupEnabled !== false,
    local_delivery_enabled: form?.localDeliveryEnabled === true,
    use_business_delivery_defaults: form?.useBusinessDeliveryDefaults !== false,
    delivery_fee_cents:
      form?.localDeliveryEnabled && !form?.useBusinessDeliveryDefaults
        ? listingDeliveryFeeCents
        : null,
    listingOptions: listingOptions || null,
  };
}

export function applyListingDraftDataToListing(listing, draftData) {
  if (!draftData || typeof draftData !== "object") {
    return {
      listing,
      listingOptions: null,
    };
  }

  const {
    listingOptions = null,
    title,
    description,
    price,
    listing_category,
    category,
    category_id,
    city,
    cover_image_id,
    inventory_status,
    inventory_quantity,
    low_stock_threshold,
    photo_url,
    photo_variants,
    pickup_enabled,
    local_delivery_enabled,
    use_business_delivery_defaults,
    delivery_fee_cents,
  } = draftData;

  return {
    listing: {
      ...listing,
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(price !== undefined ? { price } : {}),
      ...(listing_category !== undefined ? { listing_category } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(category_id !== undefined ? { category_id } : {}),
      ...(city !== undefined ? { city } : {}),
      ...(cover_image_id !== undefined ? { cover_image_id } : {}),
      ...(inventory_status !== undefined ? { inventory_status } : {}),
      ...(inventory_quantity !== undefined ? { inventory_quantity } : {}),
      ...(low_stock_threshold !== undefined ? { low_stock_threshold } : {}),
      ...(photo_url !== undefined ? { photo_url } : {}),
      ...(photo_variants !== undefined ? { photo_variants } : {}),
      ...(pickup_enabled !== undefined ? { pickup_enabled } : {}),
      ...(local_delivery_enabled !== undefined ? { local_delivery_enabled } : {}),
      ...(use_business_delivery_defaults !== undefined
        ? { use_business_delivery_defaults }
        : {}),
      ...(delivery_fee_cents !== undefined ? { delivery_fee_cents } : {}),
    },
    listingOptions,
  };
}

function trySerializeError(error) {
  if (!error || typeof error !== "object") return null;
  try {
    return JSON.stringify(error);
  } catch {
    return null;
  }
}

export function getListingSaveErrorMessage(error, fallbackMessage) {
  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  const serialized = trySerializeError(error);
  if (serialized && serialized !== "{}") {
    return serialized;
  }

  return fallbackMessage;
}

function formatInlineList(items) {
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

const PUBLISH_REQUIREMENT_LABELS = {
  title: "a title",
  price: "a price",
  category: "a category",
  photos: "a photo",
  description: "a description",
  inventory: "availability and quantity",
  deliveryFee: "a delivery fee",
  options: "product options",
};

export function getListingPublishDisabledReason(validation) {
  if (!validation || validation.ok) return "";

  const fieldErrors = validation.fieldErrors || {};
  const missingKeys = [
    "title",
    "price",
    "category",
    "photos",
    "description",
    "deliveryFee",
    "options",
  ].filter((key) => fieldErrors[key]);

  if (!missingKeys.length && fieldErrors.inventory) {
    return "Update availability or quantity so they match before publishing.";
  }

  if (!missingKeys.length) {
    return "Complete the required fields before publishing.";
  }

  if (missingKeys.length === 1 && missingKeys[0] === "options") {
    return "Finish product options before publishing.";
  }

  const labels = missingKeys
    .slice(0, 4)
    .map((key) => PUBLISH_REQUIREMENT_LABELS[key])
    .filter(Boolean);

  if (!labels.length) {
    return "Complete the required fields before publishing.";
  }

  return `Add ${formatInlineList(labels)} to publish.`;
}

export function validateListingForPublish({
  form,
  photos,
  businessFulfillmentDefaults,
  listingOptions,
  dollarsInputToCents,
}) {
  const fieldErrors = {};

  if (!normalizeText(form?.title)) {
    fieldErrors.title = "Add a listing title.";
  }

  if (!(photos || []).length) {
    fieldErrors.photos = "Add at least one photo.";
  }

  if (!normalizeText(form?.category)) {
    fieldErrors.category = "Select a category.";
  }

  if (!normalizeText(stripHtmlToText(form?.description || ""))) {
    fieldErrors.description = "Add a description.";
  }

  const publishPrice = normalizePublishPrice(form?.price);
  if (publishPrice === null) {
    fieldErrors.price = "Add a price.";
  }

  if (
    form?.localDeliveryEnabled &&
    form?.useBusinessDeliveryDefaults &&
    businessFulfillmentDefaults?.default_delivery_fee_cents == null
  ) {
    fieldErrors.deliveryFee =
      "Add a default delivery fee in business settings before enabling delivery.";
  }

  const listingDeliveryFeeCents = dollarsInputToCents(form?.deliveryFee);
  if (
    form?.localDeliveryEnabled &&
    !form?.useBusinessDeliveryDefaults &&
    (Number.isNaN(listingDeliveryFeeCents) || listingDeliveryFeeCents === null)
  ) {
    fieldErrors.deliveryFee = "Enter a valid listing delivery fee.";
  }

  const listingOptionsValidation = validateListingOptions(listingOptions);
  if (!listingOptionsValidation.ok) {
    fieldErrors.options =
      listingOptionsValidation.errors?.form?.[0] || "Finish the product options section.";
  }

  if (!listingOptionsValidation.normalized.hasOptions) {
    const { inventoryStatus, inventoryQuantity } = getManualInventoryState(form);
    const inventoryConflict =
      (inventoryStatus === "out_of_stock" && typeof inventoryQuantity === "number" && inventoryQuantity > 0) ||
      (isCountTrackedInventoryStatus(inventoryStatus) &&
        (inventoryQuantity === null || inventoryQuantity <= 0));

    if (inventoryConflict) {
      fieldErrors.inventory = "Update availability or quantity so they match before publishing.";
    }
  }

  const orderedFields = [
    "title",
    "photos",
    "category",
    "description",
    "price",
    "inventory",
    "deliveryFee",
    "options",
  ];
  const formError =
    orderedFields.map((key) => fieldErrors[key]).find(Boolean) || null;

  return {
    ok: !formError,
    fieldErrors,
    formError,
    publishPrice,
    listingDeliveryFeeCents,
    listingOptionsValidation,
  };
}
