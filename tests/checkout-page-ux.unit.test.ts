import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const checkoutPageSource = readFileSync(
  path.join(process.cwd(), "app/checkout/page.js"),
  "utf8"
);

describe("checkout page UX polish", () => {
  it("uses a compact saved contact row with an edit path before showing full inputs", () => {
    expect(checkoutPageSource).toContain("const savedContactInfo = useMemo");
    expect(checkoutPageSource).toContain("formatUSPhone(savedContactInfo.phone)");
    expect(checkoutPageSource).toContain("const hasRequiredSavedContactInfo");
    expect(checkoutPageSource).toContain("const showContactInputs = contactEditing || !hasRequiredSavedContactInfo");
    expect(checkoutPageSource).toContain("savedContactParts.join(\" · \")");
    expect(checkoutPageSource).toContain("handlePrefillFromProfile()");
    expect(checkoutPageSource).toContain("const [contactDraft, setContactDraft]");
    expect(checkoutPageSource).toContain("handleSaveContact");
    expect(checkoutPageSource).toContain("handleCancelContactEdit");
    expect(checkoutPageSource).toContain("formatUSPhone(value)");
    expect(checkoutPageSource).toContain("normalizeUSPhoneForStorage(nextContact.contact_phone)");
    expect(checkoutPageSource).toContain("isIncompleteUSPhone(nextContact.contact_phone)");
    expect(checkoutPageSource).toContain("Edit contact info");
    expect(checkoutPageSource).toContain("Cancel");
    expect(checkoutPageSource).toContain("Save");
    expect(checkoutPageSource).not.toContain("Add my info");
    expect(checkoutPageSource).toContain('placeholder="Full name"');
    expect(checkoutPageSource).toContain('placeholder="Phone number"');
  });

  it("uses a lightweight custom pickup time dropdown", () => {
    expect(checkoutPageSource).toContain("function PickupTimeDropdown");
    expect(checkoutPageSource).toContain('aria-haspopup="listbox"');
    expect(checkoutPageSource).toContain('role="listbox"');
    expect(checkoutPageSource).toContain('role="option"');
    expect(checkoutPageSource).toContain("handlePickupTimeChange");
    expect(checkoutPageSource).not.toContain('name="pickup_time"');
  });

  it("guards the payment CTA with immediate loading and duplicate-submit protection", () => {
    expect(checkoutPageSource).toContain("const submittedRef = useRef(false)");
    expect(checkoutPageSource).toContain("if (submittedRef.current) return");
    expect(checkoutPageSource).toContain("submittedRef.current = true");
    expect(checkoutPageSource).toContain("submittedRef.current = false");
    expect(checkoutPageSource).toContain("const hasInvalidCheckoutItems = stockIssues.length > 0");
    expect(checkoutPageSource).toContain("disabled={submitting || hasInvalidCheckoutItems}");
    expect(checkoutPageSource).toContain("Preparing secure checkout…");
    expect(checkoutPageSource).toContain("Continue to payment");
  });

  it("shows expired reservation recovery and blocks payment until cart is updated", () => {
    expect(checkoutPageSource).toContain("const isExpiredReservationItem");
    expect(checkoutPageSource).toContain("isExpiredReservationItem(item) ||");
    expect(checkoutPageSource).toContain("checkout-reservation-refresh");
    expect(checkoutPageSource).toContain("This item is no longer reserved.");
    expect(checkoutPageSource).toContain("Availability may have changed.");
    expect(checkoutPageSource).toContain("Update cart");
    expect(checkoutPageSource).toContain("Update cart to continue");
    expect(checkoutPageSource).toContain("item.reservation_expires_at && !reservationExpired");
    expect(checkoutPageSource).not.toContain("Your cart reservation expired.");
  });

  it("renders checkout summary thumbnails and hides the zero-tax row", () => {
    expect(checkoutPageSource).toContain("import SafeImage");
    expect(checkoutPageSource).toContain("const getCheckoutItemImageUrl");
    expect(checkoutPageSource).toContain("const getCheckoutItemVariantLabel");
    expect(checkoutPageSource).toContain("<SafeImage");
    expect(checkoutPageSource).toContain("h-16 w-16");
    expect(checkoutPageSource).toContain("object-contain object-center");
    expect(checkoutPageSource).toContain("Qty {item.quantity}");
    expect(checkoutPageSource).toContain("variantLabel");
    expect(checkoutPageSource).toContain("{tax > 0 ? (");
    expect(checkoutPageSource).toContain(">Tax</span>");
    expect(checkoutPageSource).not.toContain("Subtotal before tax");
  });

  it("keeps only one subtle Stripe helper line under the CTA", () => {
    expect(checkoutPageSource).toContain("Review your order");
    expect(checkoutPageSource).toContain("Pickup from");
    expect(checkoutPageSource).toContain("Available for pickup only.");
    expect(checkoutPageSource).toContain("Secure checkout with Stripe");
    expect(checkoutPageSource.match(/Secure checkout with Stripe/g)).toHaveLength(1);
    expect(checkoutPageSource).not.toContain("You’ll review and pay securely on Stripe.");
    expect(checkoutPageSource).not.toContain("No charges are made until the next step.");
    expect(checkoutPageSource).not.toContain("Secure payment");
    expect(checkoutPageSource).not.toContain("Pickup details shared after purchase");
    expect(checkoutPageSource).not.toContain("Order confirmation sent instantly");
  });
});
