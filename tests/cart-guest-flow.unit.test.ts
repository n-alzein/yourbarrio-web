import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addToGuestCart,
  clearGuestCart,
  getGuestCart,
  getGuestCartCount,
  GUEST_CART_STORAGE_KEY,
  removeFromGuestCart,
  setGuestCartFulfillment,
  updateGuestCartItem,
} from "@/lib/cart/guestCart";

const listing = {
  id: "listing-1",
  business_id: "business-1",
  title: "Fresh salsa",
  price: 8,
  photo_url: null,
  available_fulfillment_methods: ["pickup", "delivery"],
};

const business = {
  id: "business-1",
  business_name: "Barrio Kitchen",
};

function installLocalStorageMock() {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
  });
}

describe("guest cart utility", () => {
  beforeEach(() => {
    installLocalStorageMock();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("stores guest add-to-cart entries locally and combines quantities", () => {
    addToGuestCart({ listingId: listing.id, quantity: 2, listing, business });
    addToGuestCart({ listingId: listing.id, quantity: 1, listing, business });

    const cart = getGuestCart();
    expect(getGuestCartCount(cart)).toBe(3);
    expect(cart.carts[0].cart_items[0]).toMatchObject({
      listing_id: "listing-1",
      vendor_id: "business-1",
      quantity: 3,
      title: "Fresh salsa",
      unit_price: 8,
    });
  });

  it("updates, removes, and clears guest cart items", () => {
    addToGuestCart({ listingId: listing.id, quantity: 2, listing, business });
    updateGuestCartItem("listing-1", 5);
    expect(getGuestCartCount()).toBe(5);

    removeFromGuestCart("listing-1");
    expect(getGuestCartCount()).toBe(0);

    addToGuestCart({ listingId: listing.id, quantity: 1, listing, business });
    clearGuestCart();
    expect(getGuestCartCount()).toBe(0);
  });

  it("stores selected fulfillment by vendor", () => {
    addToGuestCart({ listingId: listing.id, quantity: 1, listing, business });
    setGuestCartFulfillment("business-1", "delivery");

    expect(getGuestCart().carts[0].fulfillment_type).toBe("delivery");
  });

  it("falls back safely when localStorage is corrupted", () => {
    window.localStorage.setItem(GUEST_CART_STORAGE_KEY, "{not-json");

    expect(getGuestCartCount()).toBe(0);
    expect(window.localStorage.getItem(GUEST_CART_STORAGE_KEY)).toBeNull();
  });
});
