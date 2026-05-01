import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const listingPageSource = readFileSync(
  path.join(process.cwd(), "app/(public)/listings/[id]/ListingDetailsClient.jsx"),
  "utf8"
);
const listingTileSource = readFileSync(
  path.join(process.cwd(), "app/(public)/listings/components/ListingMarketplaceCard.tsx"),
  "utf8"
);
const cartPageSource = readFileSync(path.join(process.cwd(), "app/cart/CartPageClient.jsx"), "utf8");
const checkoutPageSource = readFileSync(path.join(process.cwd(), "app/checkout/page.js"), "utf8");
const stripeCheckoutSource = readFileSync(
  path.join(process.cwd(), "app/api/stripe/checkout/create-session/route.ts"),
  "utf8"
);

describe("public listing guest add-to-cart flow", () => {
  it("does not open login or redirect to homepage for listing detail add-to-cart", () => {
    expect(listingPageSource).not.toContain('promptLoginForAddToCart');
    expect(listingPageSource).not.toContain('type: "add_to_cart"');
    expect(listingPageSource).not.toContain('if (!requireAuth("place orders", setStatusMessage)) return;');
    expect(listingPageSource).toContain("await addItem({");
    expect(listingPageSource).toContain("listing:");
    expect(listingPageSource).toContain("business,");
  });

  it("adds a public listing tile add-to-cart entry point", () => {
    expect(listingTileSource).toContain("const { addItem, items } = useCart()");
    expect(listingTileSource).toContain("handleAddToCart");
    expect(listingTileSource).toContain("Add to cart");
    expect(listingTileSource).toContain("listing,");
  });

  it("requires login at checkout instead of add-to-cart", () => {
    expect(cartPageSource).toContain('openModal("customer-login"');
    expect(cartPageSource).toContain("Sign in to checkout");
    expect(checkoutPageSource).toContain("Sign in to continue to checkout");
    expect(checkoutPageSource).toContain('openModal("customer-login"');
  });

  it("keeps the shared add-to-cart execution path intact", () => {
    expect(listingPageSource).toContain("const executeAddToCart = useCallback");
    expect(listingPageSource).toContain("await addItem({");
    expect(listingPageSource).toContain("listingId,");
    expect(listingPageSource).toContain("quantity: selectedQuantity");
    expect(listingPageSource).toContain("await updateCartFulfillmentType(selectedFulfillmentType");
    expect(listingPageSource).toContain('aria-label="Decrease quantity"');
    expect(listingPageSource).toContain('aria-label="Increase quantity"');
    expect(listingPageSource).toContain("const addToCartDisabled =");
    expect(listingPageSource).toContain("const selectableQuantityCap =");
    expect(listingPageSource).toContain('setStatusMessage("Currently unavailable.")');
    expect(listingPageSource).toContain("quantityInCart,");
    expect(listingPageSource).toContain("allAvailableUnitsAlreadyInCart");
    expect(listingPageSource).toContain("rgba(124,58,237,0.14)");
  });

  it("revalidates cart price and stock before payment", () => {
    expect(stripeCheckoutSource).toContain("CART_REVALIDATION_REQUIRED");
    expect(stripeCheckoutSource).toContain("removedItems");
    expect(stripeCheckoutSource).toContain("adjustedItems");
    expect(stripeCheckoutSource).toContain("repricedItems");
    expect(stripeCheckoutSource).toContain("cleanCart: false");
  });
});
