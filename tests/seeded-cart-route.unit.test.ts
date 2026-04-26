import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSupabaseServerClientMock,
  getUserCachedMock,
  getCurrentAccountContextMock,
} = vi.hoisted(() => ({
  getSupabaseServerClientMock: vi.fn(),
  getUserCachedMock: vi.fn(),
  getCurrentAccountContextMock: vi.fn(),
}));

vi.mock("@/lib/supabaseServer", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
  getUserCached: getUserCachedMock,
}));

vi.mock("@/lib/auth/getCurrentAccountContext", () => ({
  getCurrentAccountContext: getCurrentAccountContextMock,
}));

vi.mock("@/lib/fulfillment", () => ({
  BUSINESS_FULFILLMENT_SELECT: "pickup_enabled_default",
  DELIVERY_FULFILLMENT_TYPE: "delivery",
  LISTING_FULFILLMENT_SELECT: "pickup_enabled,local_delivery_enabled",
  PICKUP_FULFILLMENT_TYPE: "pickup",
  deriveFulfillmentSummary: vi.fn(() => ({
    selectedFulfillmentType: "pickup",
    availableMethods: ["pickup"],
    deliveryFeeCents: 0,
    deliveryNotes: null,
    deliveryMinOrderCents: 0,
    deliveryRadiusMiles: null,
    deliveryUnavailableReason: null,
  })),
}));

vi.mock("@/lib/listingOptions", () => ({
  getVariantInventoryListing: vi.fn((listing) => listing),
}));

import { POST } from "@/app/api/cart/route";

function createSupabaseMock() {
  return {
    from: vi.fn((table: string) => {
      if (table === "listings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: "listing-1",
                  business_id: "business-1",
                  title: "Preview item",
                  price: 12,
                  inventory_status: "in_stock",
                  inventory_quantity: 5,
                  low_stock_threshold: 1,
                  is_seeded: true,
                  pickup_enabled: true,
                  local_delivery_enabled: false,
                },
                error: null,
              })),
            })),
            in: vi.fn(async () => ({
              data: [],
              error: null,
            })),
          })),
        };
      }

      if (table === "listing_variants") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: null,
                    error: null,
                  })),
                })),
              })),
            })),
          })),
        };
      }

      if (table === "businesses") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: [{ owner_user_id: "business-1", pickup_enabled_default: true }],
              error: null,
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe("cart api seeded listing guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupabaseServerClientMock.mockResolvedValue(createSupabaseMock());
    getUserCachedMock.mockResolvedValue({
      user: { id: "customer-1" },
      error: null,
    });
    getCurrentAccountContextMock.mockResolvedValue({
      canPurchase: true,
      isRoleResolved: true,
    });
  });

  it("rejects seeded listings before cart write", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing_id: "listing-1", quantity: 1 }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "This preview item is not available for purchase yet.",
      code: "SEEDED_LISTING_NOT_PURCHASABLE",
    });
  });
});
