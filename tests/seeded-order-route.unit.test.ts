import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSupabaseServerClientMock,
  getUserCachedMock,
  getServiceClientMock,
  getCurrentAccountContextMock,
  reserveInventoryForOrderItemsMock,
  createOrderWithItemsMock,
} = vi.hoisted(() => ({
  getSupabaseServerClientMock: vi.fn(),
  getUserCachedMock: vi.fn(),
  getServiceClientMock: vi.fn(),
  getCurrentAccountContextMock: vi.fn(),
  reserveInventoryForOrderItemsMock: vi.fn(),
  createOrderWithItemsMock: vi.fn(),
}));

vi.mock("@/lib/supabaseServer", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
  getUserCached: getUserCachedMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: getServiceClientMock,
}));

vi.mock("@/lib/auth/getCurrentAccountContext", () => ({
  getCurrentAccountContext: getCurrentAccountContextMock,
}));

vi.mock("@/lib/fulfillment", () => ({
  BUSINESS_FULFILLMENT_SELECT: "pickup_enabled_default",
  DELIVERY_FULFILLMENT_TYPE: "delivery",
  LISTING_FULFILLMENT_SELECT: "pickup_enabled,local_delivery_enabled",
  deriveFulfillmentSummary: vi.fn(() => ({
    availableMethods: ["pickup"],
    deliveryFeeCents: 0,
    deliveryNotes: null,
    deliveryUnavailableReason: null,
  })),
}));

vi.mock("@/lib/listingOptions", () => ({
  getVariantInventoryListing: vi.fn((listing) => listing),
}));

vi.mock("@/lib/orders/inventoryReservations", () => ({
  applyInventoryReservationsToItems: vi.fn((items) => items),
  reserveInventoryForOrderItems: reserveInventoryForOrderItemsMock,
  restoreInventoryReservations: vi.fn(),
}));

vi.mock("@/lib/orders/persistence", () => ({
  createOrderWithItems: createOrderWithItemsMock,
}));

import { POST } from "@/app/api/orders/route";

function createSupabaseMock() {
  const cartQuery = {
    eq: vi.fn(() => cartQuery),
    order: vi.fn(() => ({
      limit: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data: {
            id: "cart-1",
            vendor_id: "business-1",
            fulfillment_type: "pickup",
            cart_items: [
              {
                id: "item-1",
                listing_id: "listing-1",
                title: "Preview item",
                unit_price: 12,
                quantity: 1,
              },
            ],
          },
          error: null,
        })),
      })),
    })),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "carts") {
        return {
          select: vi.fn(() => cartQuery),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        };
      }

      if (table === "businesses") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { owner_user_id: "business-1", pickup_enabled_default: true },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "listings") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: [
                {
                  id: "listing-1",
                  business_id: "business-1",
                  inventory_status: "in_stock",
                  inventory_quantity: 5,
                  low_stock_threshold: 1,
                  is_seeded: true,
                  pickup_enabled: true,
                  local_delivery_enabled: false,
                },
              ],
              error: null,
            })),
          })),
        };
      }

      if (table === "listing_variants") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: [],
              error: null,
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe("order api seeded listing guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const supabase = createSupabaseMock();
    getSupabaseServerClientMock.mockResolvedValue(supabase);
    getServiceClientMock.mockReturnValue(supabase);
    getUserCachedMock.mockResolvedValue({
      user: { id: "customer-1" },
      error: null,
    });
    getCurrentAccountContextMock.mockResolvedValue({
      canPurchase: true,
      isRoleResolved: true,
    });
  });

  it("rejects order creation when the cart contains a seeded listing", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart_id: "cart-1",
          contact_name: "Test Customer",
          contact_phone: "555-111-2222",
          fulfillment_type: "pickup",
        }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "This preview item is not available for purchase yet.",
      code: "SEEDED_LISTING_NOT_PURCHASABLE",
    });
    expect(reserveInventoryForOrderItemsMock).not.toHaveBeenCalled();
    expect(createOrderWithItemsMock).not.toHaveBeenCalled();
  });
});
