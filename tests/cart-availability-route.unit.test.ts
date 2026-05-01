import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSupabaseServerClientMock,
  getServiceSupabaseServerClientMock,
  getInventoryAvailabilitySnapshotMock,
} = vi.hoisted(() => ({
  getSupabaseServerClientMock: vi.fn(),
  getServiceSupabaseServerClientMock: vi.fn(),
  getInventoryAvailabilitySnapshotMock: vi.fn(),
}));

vi.mock("@/lib/supabaseServer", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: getServiceSupabaseServerClientMock,
}));

vi.mock("@/lib/cart/reservations", () => ({
  getInventoryAvailabilitySnapshot: getInventoryAvailabilitySnapshotMock,
}));

import { GET } from "@/app/api/cart/availability/route";

describe("cart availability route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupabaseServerClientMock.mockResolvedValue({ from: vi.fn(), rpc: vi.fn() });
    getServiceSupabaseServerClientMock.mockReturnValue(null);
    getInventoryAvailabilitySnapshotMock.mockResolvedValue({
      stockQuantity: 3,
      activeCartReservations: 1,
      committedOrderQuantity: 0,
      availableQuantity: 2,
    });
  });

  it("returns listing availability for the selected listing", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/cart/availability?listing_id=listing-1")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      stock_quantity: 3,
      active_cart_reservations: 1,
      available_quantity: 2,
    });
    expect(getInventoryAvailabilitySnapshotMock).toHaveBeenCalledWith({
      client: expect.any(Object),
      listingId: "listing-1",
      variantId: null,
    });
  });

  it("passes the selected variant id through for variant-specific refetches", async () => {
    await GET(
      new Request(
        "http://localhost:3000/api/cart/availability?listing_id=listing-1&variant_id=variant-1"
      )
    );

    expect(getInventoryAvailabilitySnapshotMock).toHaveBeenCalledWith({
      client: expect.any(Object),
      listingId: "listing-1",
      variantId: "variant-1",
    });
  });
});
