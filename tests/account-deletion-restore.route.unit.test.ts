import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/users/[id]/restore/route";

const { requireAdminApiRoleMock, getAdminServiceRoleClientMock } = vi.hoisted(() => ({
  requireAdminApiRoleMock: vi.fn(),
  getAdminServiceRoleClientMock: vi.fn(),
}));

vi.mock("@/lib/admin/requireAdminApiRole", () => ({
  requireAdminApiRole: requireAdminApiRoleMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdminServiceRoleClient: getAdminServiceRoleClientMock,
}));

function createAdminClientMock() {
  const usersSelectMaybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: "11111111-1111-4111-8111-111111111111",
      role: "customer",
      account_status: "pending_deletion",
      scheduled_purge_at: "2026-04-01T00:00:00.000Z",
    },
    error: null,
  });

  const usersUpdateEq2 = vi.fn().mockResolvedValue({ error: null });
  const usersUpdateEq1 = vi.fn(() => ({ eq: usersUpdateEq2 }));

  return {
    from: vi.fn((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: usersSelectMaybeSingle })),
          })),
          update: vi.fn(() => ({
            eq: usersUpdateEq1,
          })),
        };
      }
      if (table === "businesses") {
        return {
          update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc: vi.fn().mockResolvedValue({ data: "audit-id", error: null }),
  };
}

describe("POST /api/admin/users/[id]/restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restores pending deletion user for admin_super", async () => {
    requireAdminApiRoleMock.mockResolvedValue({
      ok: true,
      actorUser: {
        id: "22222222-2222-4222-8222-222222222222",
        email: "super@example.com",
      },
      actorRoleKeys: ["admin_super"],
    });
    const adminClient = createAdminClientMock();
    getAdminServiceRoleClientMock.mockReturnValue(adminClient);

    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.accountStatus).toBe("active");
    expect(adminClient.rpc).toHaveBeenCalledWith(
      "log_admin_action",
      expect.objectContaining({ p_action: "account_deletion_restored" })
    );
  });

  it("rejects non-super admins", async () => {
    requireAdminApiRoleMock.mockResolvedValue({
      ok: false,
      status: 403,
      error: "You don't have permission.",
    });

    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
    });

    expect(response.status).toBe(403);
  });
});
