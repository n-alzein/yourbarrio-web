import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

const { resolveCurrentUserRoleFromClientMock, createServerClientMock } = vi.hoisted(() => ({
  resolveCurrentUserRoleFromClientMock: vi.fn(),
  createServerClientMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveCurrentUserRoleFromClient", () => ({
  resolveCurrentUserRoleFromClient: resolveCurrentUserRoleFromClientMock,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

function makeRequest(pathname: string) {
  return new NextRequest(`http://localhost:3000${pathname}`, {
    headers: {
      "sec-fetch-mode": "navigate",
      "sec-fetch-dest": "document",
      "sec-fetch-user": "?1",
    },
  });
}

function buildSupabaseMock(accountStatus = "active") {
  return {
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "missing session" } }),
    from: vi.fn((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { account_status: accountStatus },
                error: null,
              }),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      };
    }),
  };
}

describe("middleware account deletion guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveCurrentUserRoleFromClientMock.mockResolvedValue({
      user: { id: "11111111-1111-4111-8111-111111111111" },
      role: "customer",
    });
  });

  it("redirects pending_deletion users to /account-deleted", async () => {
    createServerClientMock.mockReturnValue(buildSupabaseMock("pending_deletion"));

    const response = await middleware(makeRequest("/customer/home"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/account-deleted"
    );
  });
});
