import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyListingDraftDataToListing,
  buildListingDraftData,
  formatListingPriceInput,
  getManualInventoryState,
  getListingPublishDisabledReason,
  syncInventoryFormFromQuantity,
  syncInventoryFormFromStatus,
  validateListingForPublish,
} from "@/lib/listingEditor";

const editListingSource = readFileSync(
  path.join(process.cwd(), "app/(business)/business/listings/[id]/edit/page.js"),
  "utf8"
);

function buildPublishValidation(price) {
  return validateListingForPublish({
    form: {
      title: "Cold brew",
      description: "Small batch concentrate.",
      price,
      category: "clothing-fashion",
      inventoryQuantity: "3",
      inventoryStatus: "in_stock",
      lowStockThreshold: "",
      pickupEnabled: true,
      localDeliveryEnabled: false,
      useBusinessDeliveryDefaults: true,
      deliveryFee: "",
      city: "Austin",
    },
    photos: [{ id: "photo-1" }],
    businessFulfillmentDefaults: {
      pickup_enabled_default: true,
      local_delivery_enabled_default: false,
      default_delivery_fee_cents: null,
    },
    listingOptions: {
      hasOptions: false,
      attributes: [],
      variants: [],
    },
    dollarsInputToCents: (value) => {
      if (value === "" || value == null) return null;
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return Number.NaN;
      return Math.round(parsed * 100);
    },
  });
}

describe("Edit listing save flow", () => {
  it("renders inline save errors instead of relying on browser alerts", () => {
    expect(editListingSource).toContain('const [submitError, setSubmitError] = useState("");');
    expect(editListingSource).toContain('role="alert"');
    expect(editListingSource).toContain('setSubmitError(');
    expect(editListingSource).toContain("getListingSaveErrorMessage");
    expect(editListingSource).toContain('data-testid="listing-editor-action-status"');
    expect(editListingSource).not.toContain("alert(");
  });

  it("keeps the edit save pipeline wired through draft and publish mutations", () => {
    expect(editListingSource).toContain("<form onSubmit={handleSubmit}");
    expect(editListingSource).toContain("buildListingPublicationState(targetStatus)");
    expect(editListingSource).toContain('.from("listings")');
    expect(editListingSource).toContain(".update(payload)");
    expect(editListingSource).toContain("cover_image_id: resolvedCoverImageId");
    expect(editListingSource).toContain('.eq("id", internalListingId)');
    expect(editListingSource).toContain("await saveListingVariants(");
    expect(editListingSource).toContain("handleSaveDraft()");
    expect(editListingSource).toContain('await persistListing("draft")');
    expect(editListingSource).toContain('await persistListing("published")');
    expect(editListingSource).toContain("Save draft");
    expect(editListingSource).toContain('"Publish changes"');
    expect(editListingSource).toContain('"Publish listing"');
    expect(editListingSource).toContain('router.push("/business/listings")');
  });

  it("keeps published edits published while staging draft changes separately", () => {
    expect(editListingSource).toContain('const publicationState = buildListingPublicationState(targetStatus);');
    expect(editListingSource).toContain("buildListingDraftData({");
    expect(editListingSource).toContain("draft_data: draftData");
    expect(editListingSource).toContain("has_unpublished_changes: true");
    expect(editListingSource).toContain("draft_data: null");
    expect(editListingSource).toContain("has_unpublished_changes: false");
    expect(editListingSource).toContain('listingStatus === "published"');
    expect(editListingSource).toContain('"Publish changes"');
    expect(editListingSource).toContain('"Publish listing"');
    expect(editListingSource).toContain("setHasUnpublishedChanges(!isPublish && isPublishedListing);");
    expect(editListingSource).not.toContain("is_published:");
    expect(editListingSource).toContain("getListingPublishDisabledReason(publishValidation)");
    expect(editListingSource).toContain("publishDisabledReason");
    expect(editListingSource).toContain("formatListingPriceInput(data.price)");
    expect(editListingSource).toContain("resolveCoverImageId(hydratedPhotos, data.cover_image_id)");
  });

  it("builds and reapplies staged draft data for published listings", () => {
    const draftData = buildListingDraftData({
      form: {
        title: "Updated cold brew",
        description: "<p>Draft notes</p>",
        price: "18",
        city: "Austin",
        pickupEnabled: true,
        localDeliveryEnabled: false,
        useBusinessDeliveryDefaults: true,
      },
      taxonomy: {
        listing_category: "coffee-tea",
        category: "coffee-tea",
      },
      resolvedCoverImageId: "photo-2",
      inventoryStatus: "in_stock",
      inventoryQuantity: 6,
      lowStockThreshold: 2,
      photoUrls: ["https://example.com/cover.jpg"],
      photoVariants: [{ id: "photo-2", original: { publicUrl: "https://example.com/cover.jpg" } }],
      listingDeliveryFeeCents: null,
      listingOptions: { hasOptions: false, attributes: [], variants: [] },
    });

    const { listing, listingOptions } = applyListingDraftDataToListing(
      {
        title: "Live cold brew",
        status: "published",
        cover_image_id: null,
      },
      draftData
    );

    expect(draftData.title).toBe("Updated cold brew");
    expect(draftData.cover_image_id).toBe("photo-2");
    expect(listing.title).toBe("Updated cold brew");
    expect(listing.cover_image_id).toBe("photo-2");
    expect(listingOptions).toMatchObject({ hasOptions: false });
  });

  it("syncs quantity and availability for manual inventory edits", () => {
    expect(
      syncInventoryFormFromQuantity(
        { inventoryStatus: "out_of_stock", inventoryQuantity: "0", lowStockThreshold: "" },
        "4"
      )
    ).toMatchObject({
      inventoryStatus: "in_stock",
      inventoryQuantity: "4",
    });

    expect(
      syncInventoryFormFromQuantity(
        { inventoryStatus: "in_stock", inventoryQuantity: "4", lowStockThreshold: "2" },
        "0"
      )
    ).toMatchObject({
      inventoryStatus: "out_of_stock",
      inventoryQuantity: "0",
    });

    expect(
      syncInventoryFormFromStatus(
        { inventoryStatus: "in_stock", inventoryQuantity: "8", lowStockThreshold: "2" },
        "out_of_stock"
      )
    ).toMatchObject({
      inventoryStatus: "out_of_stock",
      inventoryQuantity: "0",
      lowStockThreshold: "",
    });

    expect(
      getManualInventoryState({
        inventoryStatus: "out_of_stock",
        inventoryQuantity: "6",
      })
    ).toEqual({
      inventoryStatus: "out_of_stock",
      inventoryQuantity: 6,
    });
  });

  it("blocks publish when manual availability and quantity conflict", () => {
    const positiveQuantityButOut = validateListingForPublish({
      form: {
        title: "Cold brew",
        description: "Small batch concentrate.",
        price: "12",
        category: "clothing-fashion",
        inventoryQuantity: "5",
        inventoryStatus: "out_of_stock",
        lowStockThreshold: "",
        pickupEnabled: true,
        localDeliveryEnabled: false,
        useBusinessDeliveryDefaults: true,
        deliveryFee: "",
        city: "Austin",
      },
      photos: [{ id: "photo-1" }],
      businessFulfillmentDefaults: {
        pickup_enabled_default: true,
        local_delivery_enabled_default: false,
        default_delivery_fee_cents: null,
      },
      listingOptions: { hasOptions: false, attributes: [], variants: [] },
      dollarsInputToCents: (value) => (value ? Math.round(Number(value) * 100) : null),
    });

    expect(positiveQuantityButOut.ok).toBe(false);
    expect(positiveQuantityButOut.fieldErrors.inventory).toBe(
      "Update availability or quantity so they match before publishing."
    );
    expect(getListingPublishDisabledReason(positiveQuantityButOut)).toBe(
      "Update availability or quantity so they match before publishing."
    );

    const zeroQuantityButAvailable = validateListingForPublish({
      form: {
        title: "Cold brew",
        description: "Small batch concentrate.",
        price: "12",
        category: "clothing-fashion",
        inventoryQuantity: "0",
        inventoryStatus: "in_stock",
        lowStockThreshold: "",
        pickupEnabled: true,
        localDeliveryEnabled: false,
        useBusinessDeliveryDefaults: true,
        deliveryFee: "",
        city: "Austin",
      },
      photos: [{ id: "photo-1" }],
      businessFulfillmentDefaults: {
        pickup_enabled_default: true,
        local_delivery_enabled_default: false,
        default_delivery_fee_cents: null,
      },
      listingOptions: { hasOptions: false, attributes: [], variants: [] },
      dollarsInputToCents: (value) => (value ? Math.round(Number(value) * 100) : null),
    });

    expect(zeroQuantityButAvailable.ok).toBe(false);
    expect(zeroQuantityButAvailable.fieldErrors.inventory).toBe(
      "Update availability or quantity so they match before publishing."
    );
  });

  it("treats hydrated numeric edit prices as publishable without touching the field", () => {
    const validation = buildPublishValidation(12);

    expect(formatListingPriceInput(12)).toBe("12");
    expect(validation.ok).toBe(true);
    expect(validation.fieldErrors.price).toBeUndefined();
    expect(getListingPublishDisabledReason(validation)).not.toContain("price");
  });

  it("disables publish when price is cleared and re-enables when a valid price is re-entered", () => {
    const clearedValidation = buildPublishValidation("");
    expect(clearedValidation.ok).toBe(false);
    expect(clearedValidation.fieldErrors.price).toBe("Add a price.");
    expect(getListingPublishDisabledReason(clearedValidation)).toContain("price");

    const restoredValidation = buildPublishValidation("14.50");
    expect(restoredValidation.ok).toBe(true);
    expect(restoredValidation.fieldErrors.price).toBeUndefined();
    expect(getListingPublishDisabledReason(restoredValidation)).toBe("");
  });
});
