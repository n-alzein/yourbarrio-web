import { describe, expect, it } from "vitest";

import {
  entityIdsMatch,
  formatEntityId,
  getEntityIdSearchVariants,
  normalizeIdValue,
  parseEntityDisplayId,
  stripKnownEntityPrefix,
} from "@/lib/entityIds";

describe("entityIds helpers", () => {
  it("normalizes legacy and canonical order display IDs to the same value", () => {
    expect(normalizeIdValue("YB-M5F8YS")).toBe("M5F8YS");
    expect(normalizeIdValue("YB-ORD-M5F8YS")).toBe("M5F8YS");
    expect(normalizeIdValue("M5F8YS")).toBe("M5F8YS");
  });

  it("formats orders without double-prefixing", () => {
    expect(formatEntityId("order", "YB-M5F8YS")).toBe("YB-ORD-M5F8YS");
    expect(formatEntityId("order", "YB-ORD-M5F8YS")).toBe("YB-ORD-M5F8YS");
    expect(formatEntityId("order", "m5f8ys")).toBe("YB-ORD-M5F8YS");
  });

  it("formats listing, sku, business, and unit display IDs in uppercase", () => {
    expect(formatEntityId("listing", "537b949ec6")).toBe("YB-LST-537B949EC6");
    expect(formatEntityId("sku", "abc-123")).toBe("YB-SKU-ABC-123");
    expect(formatEntityId("business", "shop-111")).toBe("YB-BIZ-SHOP-111");
    expect(formatEntityId("unit", "unit-42")).toBe("YB-UNT-UNIT-42");
  });

  it("parses canonical listing IDs and legacy order IDs", () => {
    expect(parseEntityDisplayId("YB-LST-537b949ec6")).toEqual({
      type: "listing",
      value: "537b949ec6",
      normalizedValue: "537b949ec6",
      displayId: "YB-LST-537B949EC6",
      hasKnownPrefix: true,
      isLegacyYbFormat: false,
    });

    expect(parseEntityDisplayId("YB-M5F8YS")).toEqual({
      type: null,
      value: "M5F8YS",
      normalizedValue: "M5F8YS",
      displayId: null,
      hasKnownPrefix: true,
      isLegacyYbFormat: true,
    });
  });

  it("produces search variants that cover raw, legacy, and canonical order IDs", () => {
    expect(getEntityIdSearchVariants("order", "M5F8YS")).toEqual(
      expect.arrayContaining(["M5F8YS", "YB-M5F8YS", "YB-ORD-M5F8YS"])
    );
  });

  it("matches equivalent order references across raw, legacy, and canonical forms", () => {
    expect(entityIdsMatch("order", "YB-M5F8YS", "YB-ORD-M5F8YS")).toBe(true);
    expect(entityIdsMatch("order", "YB-M5F8YS", "M5F8YS")).toBe(true);
    expect(entityIdsMatch("order", "YB-M5F8YS", "YB-LST-M5F8YS")).toBe(false);
  });

  it("strips nested known prefixes repeatedly", () => {
    expect(stripKnownEntityPrefix("YB-ORD-YB-M5F8YS")).toBe("M5F8YS");
  });

  it("returns empty results for invalid values", () => {
    expect(stripKnownEntityPrefix("")).toBe("");
    expect(normalizeIdValue(null)).toBe("");
    expect(formatEntityId("order", "")).toBe("");
    expect(parseEntityDisplayId("   ")).toBeNull();
  });
});
