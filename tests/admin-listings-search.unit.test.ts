import { describe, expect, it, vi } from "vitest";

import {
  resolveAdminListingSearchDescriptor,
  searchAdminListingsWithResolvers,
} from "@/lib/admin/listings";

function createResolvers() {
  return {
    findListingByPublicId: vi.fn(async (publicId: string) =>
      publicId.toLowerCase() === "537b949ec6"
        ? [{ id: "listing-1", public_id: "537b949ec6", title: "Pan Dulce Box" }]
        : []
    ),
    findListingByUuid: vi.fn(async (uuid: string) =>
      uuid === "3d4cd2a3-c74c-4082-92a4-a829f08e4084"
        ? [{ id: uuid, public_id: "537b949ec6", title: "Pan Dulce Box" }]
        : []
    ),
    findListingByOrderRef: vi.fn(async (input: string) =>
      /M5F8YS/i.test(input)
        ? [{ id: "listing-1", public_id: "537b949ec6", title: "Pan Dulce Box" }]
        : []
    ),
    searchListingsByText: vi.fn(async (input: string) =>
      /dulce/i.test(input)
        ? [{ id: "listing-1", public_id: "537b949ec6", title: "Pan Dulce Box" }]
        : []
    ),
  };
}

describe("admin listing search helpers", () => {
  it("classifies canonical listing and order IDs correctly", () => {
    expect(resolveAdminListingSearchDescriptor("YB-LST-537B949EC6")).toMatchObject({
      kind: "listing",
      normalized: "537B949EC6",
    });
    expect(resolveAdminListingSearchDescriptor("YB-SKU-537B949EC6")).toMatchObject({
      kind: "listing",
      normalized: "537B949EC6",
    });
    expect(resolveAdminListingSearchDescriptor("YB-ORD-M5F8YS")).toMatchObject({
      kind: "order",
      normalized: "M5F8YS",
    });
  });

  it("returns a listing for raw public_id searches", async () => {
    const resolvers = createResolvers();
    const rows = await searchAdminListingsWithResolvers("537b949ec6", resolvers);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.public_id).toBe("537b949ec6");
    expect(resolvers.findListingByPublicId).toHaveBeenCalled();
  });

  it("returns a listing for YB-LST and YB-SKU search formats", async () => {
    const listingResolvers = createResolvers();
    const skuResolvers = createResolvers();

    const fromListingId = await searchAdminListingsWithResolvers(
      "YB-LST-537B949EC6",
      listingResolvers
    );
    const fromSku = await searchAdminListingsWithResolvers(
      "YB-SKU-537B949EC6",
      skuResolvers
    );

    expect(fromListingId[0]?.id).toBe("listing-1");
    expect(fromSku[0]?.id).toBe("listing-1");
  });

  it("maps legacy and canonical order IDs to associated listings", async () => {
    const canonicalResolvers = createResolvers();
    const legacyResolvers = createResolvers();

    const fromCanonicalOrder = await searchAdminListingsWithResolvers(
      "YB-ORD-M5F8YS",
      canonicalResolvers
    );
    const fromLegacyOrder = await searchAdminListingsWithResolvers(
      "YB-M5F8YS",
      legacyResolvers
    );

    expect(fromCanonicalOrder[0]?.id).toBe("listing-1");
    expect(fromLegacyOrder[0]?.id).toBe("listing-1");
    expect(canonicalResolvers.findListingByOrderRef).toHaveBeenCalled();
    expect(legacyResolvers.findListingByOrderRef).toHaveBeenCalled();
  });

  it("falls back to listing uuid and fuzzy text search", async () => {
    const uuidResolvers = createResolvers();
    const textResolvers = createResolvers();

    const fromUuid = await searchAdminListingsWithResolvers(
      "3d4cd2a3-c74c-4082-92a4-a829f08e4084",
      uuidResolvers
    );
    const fromText = await searchAdminListingsWithResolvers("dulce", textResolvers);

    expect(fromUuid[0]?.id).toBe("3d4cd2a3-c74c-4082-92a4-a829f08e4084");
    expect(fromText[0]?.id).toBe("listing-1");
    expect(textResolvers.searchListingsByText).toHaveBeenCalledWith("dulce");
  });
});
