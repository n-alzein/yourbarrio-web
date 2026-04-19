import { describe, expect, it } from "vitest";

import {
  clampOrderQuantity,
  getMaxPurchasableQuantity,
  normalizeInventory,
  validateOrderQuantity,
} from "@/lib/inventory";

describe("inventory quantity rules", () => {
  it("allows inventory 1 request 1", () => {
    const listing = { inventory_status: "in_stock", inventory_quantity: 1 };
    expect(validateOrderQuantity(1, listing)).toMatchObject({
      ok: true,
      quantity: 1,
      maxQuantity: 1,
    });
  });

  it("fails inventory 1 request 2", () => {
    const listing = { inventory_status: "in_stock", inventory_quantity: 1 };
    expect(validateOrderQuantity(2, listing)).toMatchObject({
      ok: false,
      code: "INSUFFICIENT_STOCK",
      maxQuantity: 1,
    });
  });

  it("allows inventory 5 request 5", () => {
    const listing = { inventory_status: "in_stock", inventory_quantity: 5 };
    expect(validateOrderQuantity(5, listing)).toMatchObject({
      ok: true,
      quantity: 5,
      maxQuantity: 5,
    });
  });

  it("fails inventory 5 request 6", () => {
    const listing = { inventory_status: "in_stock", inventory_quantity: 5 };
    expect(validateOrderQuantity(6, listing)).toMatchObject({
      ok: false,
      code: "MAX_QUANTITY_EXCEEDED",
      maxQuantity: 5,
    });
  });

  it("clamps UI quantity to min of five and current inventory", () => {
    expect(getMaxPurchasableQuantity({ inventory_quantity: 3 })).toBe(3);
    expect(getMaxPurchasableQuantity({ inventory_quantity: 9 })).toBe(5);
    expect(clampOrderQuantity(5, { inventory_quantity: 1 })).toBe(1);
  });

  it("treats null inventory as not sellable tracked stock", () => {
    const listing = { inventory_status: "in_stock", inventory_quantity: null };
    expect(getMaxPurchasableQuantity(listing)).toBe(0);
    expect(normalizeInventory(listing)).toMatchObject({
      availability: "out",
      label: "Unavailable",
    });
  });

  it("quantity 0 is not purchasable even for legacy special statuses", () => {
    const listing = { inventory_status: "always_available", inventory_quantity: 0 };
    expect(getMaxPurchasableQuantity(listing)).toBe(0);
    expect(normalizeInventory(listing)).toMatchObject({
      availability: "out",
      label: "Out of stock",
    });
  });
});
