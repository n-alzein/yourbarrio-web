import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/settings/request-account-deletion/route";

const { createSupabaseRouteHandlerClientMock } = vi.hoisted(() => ({
  createSupabaseRouteHandlerClientMock: vi.fn(),
}));

vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseRouteHandlerClient: createSupabaseRouteHandlerClientMock,
}));

function createRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/settings/request-account-deletion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createSupabaseMock({
  accountStatus = "active",
  role = "customer",
}: {
  accountStatus?: string;
  role?: string;
} = {}) {
  const usersUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const usersUpdate = vi.fn(() => ({ eq: usersUpdateEq }));
  const usersSelectMaybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: "11111111-1111-4111-8111-111111111111",
      role,
      email: "user@example.com",
      account_status: accountStatus,
      scheduled_purge_at: accountStatus === "pending_deletion" ? "2026-04-01T00:00:00.000Z" : null,
    },
    error: null,
  });

  const businessesUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const businessesUpdate = vi.fn(() => ({ eq: businessesUpdateEq }));

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: "11111111-1111-4111-8111-111111111111",
            email: "user@example.com",
          },
        },
        error: null,
      }),
    },
    from: vi.fn((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: usersSelectMaybeSingle,
            })),
          })),
          update: usersUpdate,
        };
      }
      if (table === "businesses") {
        return {
          update: businessesUpdate,
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc: vi.fn().mockResolvedValue({ data: "audit-id", error: null }),
    __mocks: {
      usersUpdate,
      usersUpdateEq,
      businessesUpdate,
      businessesUpdateEq,
    },
  };
}

describe("POST /api/settings/request-account-deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks authenticated users as deleted from UX perspective", async () => {
    const supabase = createSupabaseMock();
    createSupabaseRouteHandlerClientMock.mockReturnValue(supabase);

    const response = await POST(
      createRequest({ confirmationText: "DELETE", confirmationEmail: "user@example.com" })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.message).toBe("Your account has been deleted.");
    expect(supabase.__mocks.usersUpdate).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "log_admin_action",
      expect.objectContaining({
        p_action: "account_deletion_requested",
      })
    );
  });

  it("is idempotent when already pending deletion", async () => {
    const supabase = createSupabaseMock({ accountStatus: "pending_deletion" });
    createSupabaseRouteHandlerClientMock.mockReturnValue(supabase);

    const response = await POST(
      createRequest({ confirmationText: "DELETE", confirmationEmail: "user@example.com" })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.message).toBe("Your account has been deleted.");
    expect(supabase.__mocks.usersUpdate).not.toHaveBeenCalled();
  });
});
