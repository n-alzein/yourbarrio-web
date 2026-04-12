import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/finalize-overdue-deletions/route";

const { requireAdminApiRoleMock, invokeFinalizeOverdueDeletionsMock } = vi.hoisted(() => ({
  requireAdminApiRoleMock: vi.fn(),
  invokeFinalizeOverdueDeletionsMock: vi.fn(),
}));

vi.mock("@/lib/admin/requireAdminApiRole", () => ({
  requireAdminApiRole: requireAdminApiRoleMock,
}));

vi.mock("@/lib/accountDeletion/invokeFinalizeOverdueDeletions", () => ({
  invokeFinalizeOverdueDeletions: invokeFinalizeOverdueDeletionsMock,
}));

describe("POST /api/admin/finalize-overdue-deletions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes the edge function for admin_super", async () => {
    requireAdminApiRoleMock.mockResolvedValue({
      ok: true,
      actorUser: {
        id: "22222222-2222-4222-8222-222222222222",
        email: "super@example.com",
      },
      actorRoleKeys: ["admin_super"],
    });

    invokeFinalizeOverdueDeletionsMock.mockResolvedValue({
      success: true,
      finalized: 1,
      failed: 0,
    });

    const response = await POST(
      new Request("http://localhost/api/admin/finalize-overdue-deletions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 5 }),
      }),
    );

    expect(response.status).toBe(200);
    expect(invokeFinalizeOverdueDeletionsMock).toHaveBeenCalledWith({
      limit: 5,
      source: "admin_api",
    });
  });

  it("rejects unauthorized admins", async () => {
    requireAdminApiRoleMock.mockResolvedValue({
      ok: false,
      status: 403,
      error: "You don't have permission.",
    });

    const response = await POST(
      new Request("http://localhost/api/admin/finalize-overdue-deletions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(403);
    expect(invokeFinalizeOverdueDeletionsMock).not.toHaveBeenCalled();
  });
});
