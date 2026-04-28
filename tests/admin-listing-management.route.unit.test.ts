import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminApiRoleMock,
  setAdminListingVisibilityMock,
  setAdminListingInternalStateMock,
} = vi.hoisted(() => ({
  requireAdminApiRoleMock: vi.fn(),
  setAdminListingVisibilityMock: vi.fn(),
  setAdminListingInternalStateMock: vi.fn(),
}));

vi.mock("@/lib/admin/requireAdminApiRole", () => ({
  requireAdminApiRole: requireAdminApiRoleMock,
}));

vi.mock("@/lib/admin/listings", () => ({
  setAdminListingVisibility: setAdminListingVisibilityMock,
  setAdminListingInternalState: setAdminListingInternalStateMock,
}));

import { PATCH } from "@/app/api/admin/listings/[id]/route";

describe("PATCH /api/admin/listings/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-admin access", async () => {
    requireAdminApiRoleMock.mockResolvedValue({
      ok: false,
      status: 403,
      error: "You don't have permission.",
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_visibility", hidden: true, reason: "test" }),
      }),
      {
        params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
      }
    );

    expect(response.status).toBe(403);
    expect(setAdminListingVisibilityMock).not.toHaveBeenCalled();
  });

  it("requires a moderation reason", async () => {
    requireAdminApiRoleMock.mockResolvedValue({
      ok: true,
      actorUser: {
        id: "admin-user-1",
        email: "admin@example.com",
      },
      actorRoleKeys: ["admin_ops"],
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_visibility", hidden: true, reason: "" }),
      }),
      {
        params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
      }
    );

    expect(response.status).toBe(400);
    expect(setAdminListingVisibilityMock).not.toHaveBeenCalled();
  });
});
