import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/internal/purge-pending-deleted-users/route";

const {
  getAdminServiceRoleClientMock,
  purgeUserAccountMock,
} = vi.hoisted(() => ({
  getAdminServiceRoleClientMock: vi.fn(),
  purgeUserAccountMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdminServiceRoleClient: getAdminServiceRoleClientMock,
}));

vi.mock("@/lib/accountDeletion/purgeUserAccount", () => ({
  purgeUserAccount: purgeUserAccountMock,
}));

function createAdminClientMock() {
  const targets = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      role: "customer",
      scheduled_purge_at: "2026-03-01T00:00:00.000Z",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      role: "business",
      scheduled_purge_at: "2026-03-01T00:00:00.000Z",
    },
  ];

  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          lte: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: targets, error: null }),
            })),
          })),
        })),
      })),
    })),
    rpc: vi.fn().mockResolvedValue({ data: "audit-id", error: null }),
  };
}

describe("POST /api/internal/purge-pending-deleted-users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ACCOUNT_PURGE_TOKEN = "test-token";
  });

  it("processes due users and continues after failures", async () => {
    const adminClient = createAdminClientMock();
    getAdminServiceRoleClientMock.mockReturnValue(adminClient);

    purgeUserAccountMock
      .mockResolvedValueOnce({
        ok: true,
        result: "purged",
        cleanupSummary: { carts: 1 },
      })
      .mockResolvedValueOnce({
        ok: false,
        result: "not_pending",
        cleanupSummary: {},
        error: "delete failed",
      });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { authorization: "Bearer test-token" },
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.purged).toBe(1);
    expect(payload.failed).toBe(1);
    expect(payload.failures).toHaveLength(1);
  });

  it("handles idempotent already-purged outcomes as skipped", async () => {
    const adminClient = createAdminClientMock();
    getAdminServiceRoleClientMock.mockReturnValue(adminClient);

    purgeUserAccountMock
      .mockResolvedValueOnce({ ok: true, result: "already_purged", cleanupSummary: {} })
      .mockResolvedValueOnce({ ok: true, result: "already_purged", cleanupSummary: {} });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { authorization: "Bearer test-token" },
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.purged).toBe(0);
    expect(payload.skipped).toBe(2);
    expect(payload.failed).toBe(0);
  });
});
