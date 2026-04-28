import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAdminDataClientMock, logAdminActionMock } = vi.hoisted(() => ({
  getAdminDataClientMock: vi.fn(),
  logAdminActionMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdminDataClient: getAdminDataClientMock,
}));

vi.mock("@/lib/admin/audit", () => ({
  logAdminAction: logAdminActionMock,
}));

import {
  setAdminListingInternalState,
  setAdminListingVisibility,
} from "@/lib/admin/listings";

function createListingClient(initialRowOverrides: Record<string, unknown> = {}) {
  let currentRow: Record<string, any> = {
    id: "11111111-1111-4111-8111-111111111111",
    public_id: "lst-111",
    title: "Pan dulce box",
    business_id: "22222222-2222-4222-8222-222222222222",
    status: "published",
    is_published: true,
    is_active: true,
    admin_hidden: false,
    is_internal: false,
    is_test: false,
    deleted_at: null,
    price: 12,
    inventory_quantity: 4,
    inventory_status: "in_stock",
    photo_url: null,
    photo_variants: null,
    cover_image_id: null,
    created_at: "2026-04-20T00:00:00.000Z",
    updated_at: "2026-04-21T00:00:00.000Z",
    ...initialRowOverrides,
  };

  return {
    rpc: vi.fn(),
    from: vi.fn((table: string) => {
      if (table === "listings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { ...currentRow },
                error: null,
              }),
            })),
          })),
          update: vi.fn((updates: Record<string, unknown>) => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                maybeSingle: vi.fn().mockImplementation(async () => {
                  currentRow = {
                    ...currentRow,
                    ...updates,
                  };
                  return { data: { ...currentRow }, error: null };
                }),
              })),
            })),
          })),
        };
      }

      if (table === "businesses") {
        return {
          select: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  owner_user_id: "22222222-2222-4222-8222-222222222222",
                  public_id: "biz-222",
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
}

describe("admin listing audited actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logAdminActionMock.mockResolvedValue({ ok: true, id: "audit-1" });
  });

  it("hide/unhide updates the listing and writes audit metadata", async () => {
    const client = createListingClient();
    getAdminDataClientMock.mockResolvedValue({ client });

    const updated = await setAdminListingVisibility({
      listingId: "11111111-1111-4111-8111-111111111111",
      hidden: true,
      actorUserId: "admin-user-1",
      reason: "Marketplace policy violation",
    });

    expect(updated?.status).toBe("hidden");
    expect(updated?.admin_hidden).toBe(true);
    expect(logAdminActionMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        action: "listing_hidden",
        actorUserId: "admin-user-1",
        targetType: "listing",
        targetId: "11111111-1111-4111-8111-111111111111",
        meta: expect.objectContaining({
          field: "visibility",
          previous_value: expect.any(Object),
          new_value: expect.objectContaining({ admin_hidden: true }),
          reason: "Marketplace policy violation",
          changed_at: expect.any(String),
        }),
      })
    );
  });

  it("internal/test toggle updates the listing and writes audit metadata", async () => {
    const client = createListingClient();
    getAdminDataClientMock.mockResolvedValue({ client });

    const updated = await setAdminListingInternalState({
      listingId: "11111111-1111-4111-8111-111111111111",
      internal: true,
      actorUserId: "admin-user-1",
      reason: "Seed-only test content",
    });

    expect(updated?.is_internal).toBe(true);
    expect(logAdminActionMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        action: "listing_marked_internal",
        actorUserId: "admin-user-1",
        targetType: "listing",
        targetId: "11111111-1111-4111-8111-111111111111",
        meta: expect.objectContaining({
          field: "internal_test",
          previous_value: expect.any(Object),
          new_value: expect.objectContaining({ is_internal: true }),
          reason: "Seed-only test content",
          changed_at: expect.any(String),
        }),
      })
    );
  });
});
