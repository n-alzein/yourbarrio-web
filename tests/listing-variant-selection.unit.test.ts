import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const listingDetailsSource = readFileSync(
  path.join(process.cwd(), "app/(public)/listings/[id]/ListingDetailsClient.jsx"),
  "utf8"
);
const cartRouteSource = readFileSync(
  path.join(process.cwd(), "app/api/cart/route.js"),
  "utf8"
);
const newListingSource = readFileSync(
  path.join(process.cwd(), "app/(business)/business/listings/new/page.jsx"),
  "utf8"
);
const editListingSource = readFileSync(
  path.join(process.cwd(), "app/(business)/business/listings/[id]/edit/page.js"),
  "utf8"
);
const variantMatrixSource = readFileSync(
  path.join(process.cwd(), "components/business/listings/VariantMatrix.jsx"),
  "utf8"
);
const attributeEditorSource = readFileSync(
  path.join(process.cwd(), "components/business/listings/AttributeEditor.jsx"),
  "utf8"
);
const listingOptionsSectionSource = readFileSync(
  path.join(process.cwd(), "components/business/listings/ListingOptionsSection.jsx"),
  "utf8"
);
const publicOptionSelectorsSource = readFileSync(
  path.join(process.cwd(), "components/listings/ListingOptionSelectors.jsx"),
  "utf8"
);

describe("variant listing add-to-cart guards", () => {
  it("blocks listing detail add-to-cart until a variant is selected", () => {
    expect(listingDetailsSource).toContain("Select each product option before adding this item to your cart.");
    expect(listingDetailsSource).toContain("variantId: selectedVariant?.id || null");
    expect(listingDetailsSource).toContain("ListingOptionSelectors");
    expect(listingDetailsSource).toContain("/api/cart/availability?");
    expect(listingDetailsSource).toContain("selectedVariant?.id");
  });

  it("revalidates variant selection on the cart api", () => {
    expect(cartRouteSource).toContain("Select a product option before adding this item to your cart.");
    expect(cartRouteSource).toContain("variant_id");
    expect(cartRouteSource).toContain("getVariantInventoryListing");
  });

  it("derives listing inventory from variants in create and edit flows", () => {
    expect(newListingSource).toContain("deriveListingInventoryFromVariants");
    expect(newListingSource).toContain("Inventory is managed per variant above. Total available:");
    expect(newListingSource).toContain("ListingPreviewCard");
    expect(newListingSource).toContain("listingOptionsValidation.normalized.hasOptions");
    expect(newListingSource).toContain("? derivedVariantInventory.inventoryQuantity");

    expect(editListingSource).toContain("deriveListingInventoryFromVariants");
    expect(editListingSource).toContain("Inventory is managed per variant above. Total available:");
    expect(editListingSource).toContain("ListingPreviewCard");
    expect(editListingSource).toContain("listingOptionsValidation.normalized.hasOptions");
    expect(editListingSource).toContain("? derivedVariantInventory.inventoryQuantity");
  });

  it("treats price overrides as nullable and seeds from the base listing price in the UI", () => {
    expect(variantMatrixSource).toContain('placeholder="Use base price"');
    expect(variantMatrixSource).toContain("if (variant?.price !== null && variant?.price !== undefined && variant?.price !== \"\")");
    expect(variantMatrixSource).toContain("price: normalizedBasePrice");
    expect(variantMatrixSource).toContain('min="0.01"');
    expect(newListingSource).toContain("basePrice={form.price}");
    expect(editListingSource).toContain("basePrice={form.price}");
  });

  it("keeps options always required without exposing a required toggle", () => {
    expect(attributeEditorSource).not.toContain(">Required<");
    expect(attributeEditorSource).not.toContain('type="checkbox"');
    expect(listingOptionsSectionSource).toContain("required: true");
  });

  it("uses lighter public option selector states", () => {
    expect(publicOptionSelectorsSource).toContain("rgba(124,58,237,0.10)");
    expect(publicOptionSelectorsSource).toContain("rgb(91,33,182)");
    expect(publicOptionSelectorsSource).toContain("cursor-not-allowed");
    expect(publicOptionSelectorsSource).toContain("min-h-11");
  });
});
