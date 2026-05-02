import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CHECKOUT_INTENT_COOKIE_NAME,
  CHECKOUT_INTENT_STORAGE_KEY,
  clearAuthIntent,
  clearCheckoutIntentPending,
  readCheckoutIntentPending,
  setAuthIntent,
  setCheckoutHandoffState,
  readCheckoutHandoffState,
  CHECKOUT_HANDOFF_STATES,
} from "@/lib/auth/authIntent";

const cartPageSource = fs.readFileSync(
  path.join(process.cwd(), "app/cart/CartPageClient.jsx"),
  "utf8"
);
const emptyCartStateSource = fs.readFileSync(
  path.join(process.cwd(), "components/cart/EmptyCartState.jsx"),
  "utf8"
);
const cartServerPageSource = fs.readFileSync(
  path.join(process.cwd(), "app/cart/page.js"),
  "utf8"
);
const checkoutPageSource = fs.readFileSync(
  path.join(process.cwd(), "app/checkout/page.js"),
  "utf8"
);
const customerLoginModalSource = fs.readFileSync(
  path.join(process.cwd(), "components/modals/CustomerLoginModal.jsx"),
  "utf8"
);

describe("checkout intent storage", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("persists checkout intent separately from the normal post-login auth intent", () => {
    setAuthIntent({ redirectTo: "/checkout?business_id=vendor-1", role: "customer" });

    expect(readCheckoutIntentPending()).toMatchObject({
      redirectTo: "/checkout?business_id=vendor-1",
    });
    expect(document.cookie).toContain(`${CHECKOUT_INTENT_COOKIE_NAME}=`);

    clearAuthIntent();

    expect(readCheckoutIntentPending()).toMatchObject({
      redirectTo: "/checkout?business_id=vendor-1",
    });
  });

  it("does not keep checkout intent for non-checkout login redirects", () => {
    setAuthIntent({ redirectTo: "/cart", role: "customer" });

    expect(window.sessionStorage.getItem(CHECKOUT_INTENT_STORAGE_KEY)).toBeNull();
    expect(document.cookie).not.toContain(`${CHECKOUT_INTENT_COOKIE_NAME}=`);
    expect(readCheckoutIntentPending()).toBeNull();
  });

  it("clears checkout intent explicitly after checkout arrival or failed handoff", () => {
    setAuthIntent({ redirectTo: "/checkout", role: "customer" });

    clearCheckoutIntentPending();

    expect(window.sessionStorage.getItem(CHECKOUT_INTENT_STORAGE_KEY)).toBeNull();
    expect(document.cookie).not.toContain(`${CHECKOUT_INTENT_COOKIE_NAME}=`);
    expect(readCheckoutIntentPending()).toBeNull();
  });

  it("tracks explicit checkout handoff states separately from auth cleanup", () => {
    setAuthIntent({ redirectTo: "/checkout", role: "customer" });
    setCheckoutHandoffState(CHECKOUT_HANDOFF_STATES.authenticating);

    clearAuthIntent();

    expect(readCheckoutHandoffState()).toBe(CHECKOUT_HANDOFF_STATES.authenticating);
    expect(readCheckoutIntentPending()).toMatchObject({ redirectTo: "/checkout" });
  });
});

describe("cart server checkout handoff guard", () => {
  it("redirects away from /cart before rendering client empty-cart UI when checkout cookie exists", () => {
    expect(cartServerPageSource).toContain('const CHECKOUT_INTENT_COOKIE_NAME = "yb_checkout_intent"');
    expect(cartServerPageSource).toContain("readCheckoutIntentCookie");
    expect(cartServerPageSource).toContain("redirect(checkoutRedirect)");
    expect(cartServerPageSource.indexOf("redirect(checkoutRedirect)")).toBeLessThan(
      cartServerPageSource.indexOf("return <CartPageClient")
    );
  });

  it("uses an auth handoff server prop to suppress /cart empty SSR without a cookie", () => {
    expect(cartServerPageSource).toContain("authHandoffPending");
    expect(cartServerPageSource).toContain("yb_auth_handoff");
    expect(cartServerPageSource).toContain("yb_auth_fresh");
    expect(cartServerPageSource).toContain("suppressEmptyState={authHandoffPending}");
  });
});

describe("cart checkout handoff guards", () => {
  it("blocks the empty-cart UI until checkout intent and handoff state are resolved", () => {
    expect(cartPageSource).toContain("const shouldSuppressCartEmptyState");
    expect(cartPageSource).toContain("checkoutHandoffActive");
    expect(cartPageSource).toContain("CHECKOUT_HANDOFF_STATES.mergingGuestCart");
    expect(cartPageSource).toContain("CHECKOUT_HANDOFF_STATES.redirectingToCheckout");
    expect(cartPageSource).toContain('cartStatus !== "ready"');
    expect(cartPageSource).toContain("!checkoutIntentChecked");
    expect(cartPageSource).toContain("Boolean(checkoutIntent?.redirectTo)");
    expect(cartPageSource).toContain("suppressEmptyState");
    expect(cartPageSource).toContain("if (shouldSuppressCartEmptyState)");
  });

  it("redirects directly to checkout after auth handoff without waiting for cart readiness", () => {
    expect(cartPageSource).toContain("mergeGuestCartForCheckout({ guestCart: readGuestCartSafely() })");
    expect(cartPageSource).toContain("router.replace(checkoutIntent.redirectTo)");
    expect(cartPageSource).toContain("router.replace(destination)");
  });

  it("clears stale checkout intent after confirmed empty handoff failure", () => {
    expect(cartPageSource).toContain("clearCheckoutIntentPending()");
    expect(cartPageSource).toContain("window.setTimeout");
  });

  it("clears checkout intent on successful checkout page arrival", () => {
    expect(checkoutPageSource).toContain("clearCheckoutIntentPending()");
  });

  it("clears checkout intent when login is canceled", () => {
    expect(customerLoginModalSource).toContain("clearCheckoutIntentPending()");
    expect(customerLoginModalSource).toContain("if (canceled) clearCheckoutIntentPending()");
  });

  it("keeps the checkout modal mounted on login success until checkout navigation takes over", () => {
    expect(customerLoginModalSource).toContain("isCheckoutRedirectPath(destination)");
    expect(customerLoginModalSource).toContain("handleClose({ canceled: false })");
  });

  it("does not render the legacy empty-cart copy anywhere in cart or checkout flow", () => {
    expect(cartPageSource).not.toContain("Add items before checking out.");
    expect(checkoutPageSource).not.toContain("Add items before checking out.");
  });

  it("only renders empty state after the canonical suppression gate is false and the cart is confirmed empty", () => {
    expect(cartPageSource).toContain("!shouldSuppressCartEmptyState");
    expect(cartPageSource).toContain('cartStatus === "ready"');
    expect(cartPageSource).toContain("items.length === 0");
    expect(cartPageSource).toContain("return <EmptyCartState />");
  });

  it("routes direct empty-cart rendering through the canonical purple empty state", () => {
    expect(cartPageSource).toContain("import EmptyCartState");
    expect(cartPageSource).toContain("return <EmptyCartState />");
    expect(checkoutPageSource).toContain("import EmptyCartState");
    expect(checkoutPageSource).toContain("return <EmptyCartState />");
    expect(emptyCartStateSource).toContain("yb-cart-empty-cta");
    expect(emptyCartStateSource).toContain("Browse local listings");
  });
});
