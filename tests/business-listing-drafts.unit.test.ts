import { beforeEach, describe, expect, it, vi } from "vitest";

const { getBusinessDataClientForRequestMock, getListingVariantsMock } = vi.hoisted(() => ({
  getBusinessDataClientForRequestMock: vi.fn(),
  getListingVariantsMock: vi.fn(async () => ({ hasOptions: false, attributes: [], variants: [] })),
}));

vi.mock("@/lib/business/getBusinessDataClientForRequest", () => ({
  getBusinessDataClientForRequest: getBusinessDataClientForRequestMock,
}));

vi.mock("@/lib/listingOptions", () => ({
  getListingVariants: getListingVariantsMock,
}));

import { GET } from "@/app/api/business/listings/route";

function createListingsClient(listings: Record<string, unknown>[]) {
  return {
    from: vi.fn((table: string) => {
      if (table !== "listings") {
        throw new Error(`Unexpected table: ${table}`);
      }

      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(async () => ({
          data: listings,
          error: null,
        })),
        maybeSingle: vi.fn(async () => ({
          data: listings[0] || null,
          error: null,
        })),
      };

      return query;
    }),
  };
}

describe("business listing drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns draft listings to the owning business", async () => {
    getBusinessDataClientForRequestMock.mockResolvedValue({
      ok: true,
      client: createListingsClient([
        {
          id: "listing-1",
          business_id: "business-1",
          title: "Draft listing",
          status: "draft",
          is_published: false,
        },
      ]),
      effectiveUserId: "business-1",
    });

    const response = await GET(
      new Request("http://localhost:3000/api/business/listings")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.listings).toHaveLength(1);
    expect(payload.listings[0]).toMatchObject({
      id: "listing-1",
      status: "draft",
      is_published: false,
    });
  });

  it("overlays saved unpublished changes for published listings in edit reads", async () => {
    getBusinessDataClientForRequestMock.mockResolvedValue({
      ok: true,
      client: createListingsClient([
        {
          id: "listing-2",
          business_id: "business-1",
          title: "Live listing",
          status: "published",
          has_unpublished_changes: true,
          draft_data: {
            title: "Draft title",
            cover_image_id: "photo-2",
            listingOptions: {
              hasOptions: false,
              attributes: [],
              variants: [],
            },
          },
        },
      ]),
      effectiveUserId: "business-1",
    });

    const response = await GET(
      new Request("http://localhost:3000/api/business/listings?id=listing-2")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.listing).toMatchObject({
      id: "listing-2",
      status: "published",
      title: "Draft title",
      has_unpublished_changes: true,
      cover_image_id: "photo-2",
    });
    expect(payload.listingOptions).toMatchObject({
      hasOptions: false,
      attributes: [],
      variants: [],
    });
  });
});
