import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminApiRoleMock, listAdminBusinessListingsMock } = vi.hoisted(() => ({
  requireAdminApiRoleMock: vi.fn(),
  listAdminBusinessListingsMock: vi.fn(),
}));

vi.mock("@/lib/admin/requireAdminApiRole", () => ({
  requireAdminApiRole: requireAdminApiRoleMock,
}));

vi.mock("@/lib/admin/listings", () => ({
  ADMIN_BUSINESS_LISTINGS_PAGE_SIZE: 20,
  listAdminBusinessListings: listAdminBusinessListingsMock,
}));

import { GET } from "@/app/api/admin/businesses/[id]/listings/route";

describe("GET /api/admin/businesses/[id]/listings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches listings for the selected business account", async () => {
    requireAdminApiRoleMock.mockResolvedValue({
      ok: true,
      actorUser: {
        id: "admin-user-1",
        email: "admin@example.com",
      },
      actorRoleKeys: ["admin_readonly"],
    });
    listAdminBusinessListingsMock.mockResolvedValue({
      rows: [{ id: "listing-1" }],
      totalCount: 1,
      page: 1,
      pageSize: 20,
    });

    const response = await GET(new Request("http://localhost?status=published&page=2&page_size=10"), {
      params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(listAdminBusinessListingsMock).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      expect.objectContaining({
        status: "published",
        page: 2,
        pageSize: 10,
      })
    );
    expect(payload.rows).toHaveLength(1);
  });

  it("rejects non-admin access", async () => {
    requireAdminApiRoleMock.mockResolvedValue({
      ok: false,
      status: 403,
      error: "You don't have permission.",
    });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
    });

    expect(response.status).toBe(403);
    expect(listAdminBusinessListingsMock).not.toHaveBeenCalled();
  });
});
