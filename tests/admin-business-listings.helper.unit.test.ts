import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAdminDataClientMock } = vi.hoisted(() => ({
  getAdminDataClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdminDataClient: getAdminDataClientMock,
}));

import { listAdminBusinessListings } from "@/lib/admin/listings";

describe("listAdminBusinessListings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never returns listings from another business account", async () => {
    const targetBusinessId = "11111111-1111-4111-8111-111111111111";
    const otherBusinessId = "22222222-2222-4222-8222-222222222222";

    const listingsQuery = {
      select: vi.fn(() => listingsQuery),
      eq: vi.fn(() => listingsQuery),
      order: vi.fn(() => listingsQuery),
      range: vi.fn().mockResolvedValue({
        data: [
          {
            id: "listing-visible",
            business_id: targetBusinessId,
            title: "Visible listing",
            public_id: "lst-visible",
            admin_hidden: false,
            is_internal: false,
            is_test: false,
            status: "published",
            is_published: true,
            is_active: true,
            created_at: "2026-04-20T00:00:00.000Z",
            updated_at: "2026-04-21T00:00:00.000Z",
          },
          {
            id: "listing-other-business",
            business_id: otherBusinessId,
            title: "Wrong business listing",
            public_id: "lst-other",
            admin_hidden: false,
            is_internal: false,
            is_test: false,
            status: "published",
            is_published: true,
            is_active: true,
            created_at: "2026-04-20T00:00:00.000Z",
            updated_at: "2026-04-21T00:00:00.000Z",
          },
        ],
        error: null,
        count: 2,
      }),
    };

    const client = {
      from: vi.fn((table: string) => {
        if (table === "listings") return listingsQuery;
        if (table === "businesses") {
          return {
            select: vi.fn(() => ({
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    owner_user_id: targetBusinessId,
                    public_id: "biz-111",
                    business_name: "Barrio Shop",
                  },
                ],
              }),
            })),
          };
        }
        if (table === "order_items") {
          return {
            select: vi.fn(() => ({
              in: vi.fn().mockResolvedValue({
                data: [],
              }),
            })),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    getAdminDataClientMock.mockResolvedValue({ client });

    const result = await listAdminBusinessListings(targetBusinessId, { page: 1, pageSize: 20 });

    expect(listingsQuery.eq).toHaveBeenCalledWith("business_id", targetBusinessId);
    expect(result.totalCount).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.business_id).toBe(targetBusinessId);
    expect(result.rows[0]?.id).toBe("listing-visible");
  });
});
