import { describe, expect, it } from "vitest";
import {
  clampListingQuantitySelection,
  getCartItemIdsForListingSelection,
  getListingAvailabilityMessage,
  getQuantityInCartForListingSelection,
  resolveListingQuantityState,
} from "@/lib/cart/listingAvailability";

describe("listing quantity availability", () => {
  it("clamps a selected quantity from 3 down to 2 when the server reports only 2 left", () => {
    const state = resolveListingQuantityState({
      inventoryMaxQuantity: 3,
      selectedQuantity: 3,
      serverAvailableQuantity: 2,
    });

    expect(state.selectableQuantityCap).toBe(2);
    expect(state.clampedQuantity).toBe(2);
    expect(getListingAvailabilityMessage({
      inventoryMaxQuantity: 3,
      serverAvailableQuantity: 2,
    })).toBe("Only 2 left available.");
  });

  it("disables the plus path at the known available quantity", () => {
    const state = resolveListingQuantityState({
      inventoryMaxQuantity: 5,
      selectedQuantity: 2,
      serverAvailableQuantity: 2,
    });

    expect(state.selectableQuantityCap).toBe(2);
    expect(state.clampedQuantity).toBe(2);
    expect(clampListingQuantitySelection(state.clampedQuantity + 1, state.selectableQuantityCap)).toBe(2);
  });

  it("treats server available quantity 0 as currently unavailable", () => {
    const state = resolveListingQuantityState({
      inventoryMaxQuantity: 5,
      selectedQuantity: 1,
      serverAvailableQuantity: 0,
    });

    expect(state.selectableQuantityCap).toBe(0);
    expect(state.clampedQuantity).toBe(0);
    expect(state.isCurrentlyUnavailable).toBe(true);
    expect(getListingAvailabilityMessage({
      inventoryMaxQuantity: 5,
      serverAvailableQuantity: 0,
    })).toBe("Currently unavailable.");
  });

  it("treats inventory excluded from the user's own cart lines as fully held in cart", () => {
    const quantityInCart = getQuantityInCartForListingSelection({
      cartItems: [
        { id: "item-1", listing_id: "listing-1", quantity: 2 },
      ],
      listingId: "listing-1",
    });

    const state = resolveListingQuantityState({
      inventoryMaxQuantity: 2,
      selectedQuantity: 1,
      serverAvailableQuantity: 2,
      quantityInCart,
    });

    expect(state.selectableQuantityCap).toBe(0);
    expect(state.allAvailableUnitsAlreadyInCart).toBe(true);
    expect(getListingAvailabilityMessage({
      inventoryMaxQuantity: 2,
      serverAvailableQuantity: 2,
      quantityInCart,
    })).toBe("All available units are already in your cart.");
  });

  it("restores addable quantity after cart quantity drops", () => {
    const state = resolveListingQuantityState({
      inventoryMaxQuantity: 2,
      selectedQuantity: 1,
      serverAvailableQuantity: 2,
      quantityInCart: 1,
    });

    expect(state.selectableQuantityCap).toBe(1);
    expect(state.allAvailableUnitsAlreadyInCart).toBe(false);
    expect(getListingAvailabilityMessage({
      inventoryMaxQuantity: 2,
      serverAvailableQuantity: 2,
      quantityInCart: 1,
    })).toBe("Only 1 left available.");
  });

  it("matches guest and auth cart items identically for variant and listing selection", () => {
    const guestItems = [
      { id: "guest-item", listing_id: "listing-1", variant_id: "variant-a", quantity: 1 },
    ];
    const authItems = [
      { id: "auth-item", listing_id: "listing-1", variant_id: "variant-a", quantity: 1 },
    ];

    expect(
      getQuantityInCartForListingSelection({
        cartItems: guestItems,
        listingId: "listing-1",
        variantId: "variant-a",
      })
    ).toBe(
      getQuantityInCartForListingSelection({
        cartItems: authItems,
        listingId: "listing-1",
        variantId: "variant-a",
      })
    );

    expect(
      getCartItemIdsForListingSelection({
        cartItems: guestItems,
        listingId: "listing-1",
        variantId: "variant-a",
      })
    ).toEqual(["guest-item"]);
    expect(
      getCartItemIdsForListingSelection({
        cartItems: authItems,
        listingId: "listing-1",
        variantId: "variant-a",
      })
    ).toEqual(["auth-item"]);
  });
});
