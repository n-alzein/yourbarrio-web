import { describe, expect, it } from "vitest";
import {
  BUSINESS_LISTINGS_VIEW_STORAGE_KEY,
  filterAndSortListings,
  getCustomerFacingPrice,
  getListingCategoryFilterValue,
  getListingRef,
  getListingSku,
  getListingStatus,
} from "@/lib/business/listingsCatalog";

describe("business listings catalog helpers", () => {
  it("returns only safe short listing refs and never raw UUIDs", () => {
    expect(getListingRef({ public_id: "abc123" })).toBe("ABC123");
    expect(
      getListingRef({ public_id: "550e8400-e29b-41d4-a716-446655440000" })
    ).toBeNull();
    expect(getListingRef({ id: "listing-1" })).toBeNull();
  });

  it("supports sku lookup and customer-facing price derivation", () => {
    expect(getListingSku({ sku: "cold-brew-1" })).toBe("COLD-BREW-1");
    expect(getCustomerFacingPrice({ price: 27.99 })).toBeGreaterThan(2799);
  });

  it("filters by title, safe ref, status, and category and sorts by stock", () => {
    const listings = [
      {
        id: "listing-1",
        public_id: "abc123",
        title: "Cold Brew",
        category: "coffee-tea",
        price: 20,
        inventory_quantity: 9,
        status: "published",
        created_at: "2026-04-24T10:00:00.000Z",
      },
      {
        id: "listing-2",
        public_id: "def456",
        title: "Pan Dulce",
        category: "bakery",
        price: 12,
        inventory_quantity: 0,
        status: "published",
        created_at: "2026-04-25T10:00:00.000Z",
      },
      {
        id: "listing-3",
        public_id: "ghi789",
        title: "Draft Mole",
        category: "prepared-food",
        price: 18,
        inventory_quantity: 4,
        status: "draft",
        created_at: "2026-04-23T10:00:00.000Z",
      },
    ];

    expect(
      filterAndSortListings(listings, {
        search: "abc123",
        status: "all",
        category: "all",
        sort: "updated",
      })
    ).toHaveLength(1);

    expect(
      filterAndSortListings(listings, {
        search: "",
        status: "out_of_stock",
        category: "all",
        sort: "updated",
      })[0]?.title
    ).toBe("Pan Dulce");

    expect(
      filterAndSortListings(listings, {
        search: "",
        status: "all",
        category: getListingCategoryFilterValue(listings[0]),
        sort: "stock",
      })[0]?.title
    ).toBe("Cold Brew");
  });

  it("derives display statuses for live, draft, unpublished changes, and out of stock", () => {
    expect(getListingStatus({ status: "published", inventory_quantity: 3 }).label).toBe("Live");
    expect(getListingStatus({ status: "draft", inventory_quantity: 3 }).label).toBe("Draft");
    expect(
      getListingStatus({
        status: "published",
        inventory_quantity: 3,
        has_unpublished_changes: true,
      }).label
    ).toBe("Changes not published");
    expect(getListingStatus({ status: "published", inventory_quantity: 0 }).label).toBe(
      "Out of stock"
    );
  });

  it("uses the expected localStorage key for view persistence", () => {
    expect(BUSINESS_LISTINGS_VIEW_STORAGE_KEY).toBe("yb_business_listings_view");
  });
});
