import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSupabaseServerClientMock,
  getUserCachedMock,
  getPublicBusinessByOwnerIdMock,
  getCurrentViewerVisibilityGateMock,
  canViewerAccessPublicTargetMock,
  withListingPricingMock,
  getListingVariantsMock,
} = vi.hoisted(() => ({
  getSupabaseServerClientMock: vi.fn(),
  getUserCachedMock: vi.fn(),
  getPublicBusinessByOwnerIdMock: vi.fn(),
  getCurrentViewerVisibilityGateMock: vi.fn(),
  canViewerAccessPublicTargetMock: vi.fn(),
  withListingPricingMock: vi.fn((listing) => listing),
  getListingVariantsMock: vi.fn(async () => null),
}));

vi.mock("@/lib/supabaseServer", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
  getUserCached: getUserCachedMock,
}));

vi.mock("@/lib/business/getPublicBusinessByOwnerId", () => ({
  getPublicBusinessByOwnerId: getPublicBusinessByOwnerIdMock,
}));

vi.mock("@/lib/publicVisibility", () => ({
  getCurrentViewerVisibilityGate: getCurrentViewerVisibilityGateMock,
  canViewerAccessPublicTarget: canViewerAccessPublicTargetMock,
}));

vi.mock("@/lib/pricing", () => ({
  withListingPricing: withListingPricingMock,
}));

vi.mock("@/lib/listingOptions", () => ({
  getListingVariants: getListingVariantsMock,
}));

import { GET } from "@/app/api/customer/listings/route";

function createSupabaseMock({ listing }: { listing: Record<string, unknown> | null }) {
  return {
    rpc: vi.fn(async () => ({
      data: [{ id: "listing-1" }],
      error: null,
    })),
    from: vi.fn((table: string) => {
      if (table === "public_listings_v") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: listing,
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { role: "customer" },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "saved_listings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: null,
                  error: null,
                })),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe("customer listing visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserCachedMock.mockResolvedValue({
      user: { id: "customer-1" },
      error: null,
    });
    getPublicBusinessByOwnerIdMock.mockResolvedValue({
      owner_user_id: "business-1",
      is_internal: false,
    });
    getCurrentViewerVisibilityGateMock.mockResolvedValue({
      viewerCanSeeInternalContent: false,
    });
    canViewerAccessPublicTargetMock.mockReturnValue(true);
  });

  it("does not return draft listings through the customer listing API", async () => {
    getSupabaseServerClientMock.mockResolvedValue(createSupabaseMock({ listing: null }));

    const response = await GET(
      new Request("http://localhost:3000/api/customer/listings?id=listing-1")
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });

  it("returns published listings through the customer listing API", async () => {
    getSupabaseServerClientMock.mockResolvedValue(
      createSupabaseMock({
        listing: {
          id: "listing-1",
          business_id: "business-1",
          title: "Published listing",
          status: "published",
          is_published: true,
          is_internal: false,
        },
      })
    );

    const response = await GET(
      new Request("http://localhost:3000/api/customer/listings?id=listing-1")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.listing.id).toBe("listing-1");
    expect(payload.listing.status).toBe("published");
    expect(payload.listing.title).toBe("Published listing");
  });
});
