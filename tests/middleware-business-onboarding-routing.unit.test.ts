import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

const { resolveCurrentUserRoleFromClientMock, createServerClientMock } = vi.hoisted(() => ({
  resolveCurrentUserRoleFromClientMock: vi.fn(),
  createServerClientMock: vi.fn(),
}));

vi.mock("@/lib/auth/getCurrentUserRole", () => ({
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

function buildSupabaseMock({
  businessRow = null,
  accountStatus = "active",
}: {
  businessRow?: any;
  accountStatus?: string;
} = {}) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "missing session" } }),
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn((table) => {
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
            maybeSingle: vi.fn().mockResolvedValue({ data: businessRow, error: null }),
          })),
        })),
      };
    }),
  };
}

describe("middleware business onboarding routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServerClientMock.mockReturnValue(buildSupabaseMock());
    resolveCurrentUserRoleFromClientMock.mockResolvedValue({ user: null, role: null });
  });

  it("redirects legacy /business/onboarding to /onboarding", async () => {
    const response = await middleware(makeRequest("/business/onboarding"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/onboarding");
  });

  it("redirects unauthenticated /onboarding to business login with next", async () => {
    const response = await middleware(makeRequest("/onboarding"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/business-auth/login?next=%2Fonboarding"
    );
  });

  it("redirects incomplete business from /business/dashboard to /onboarding", async () => {
    resolveCurrentUserRoleFromClientMock.mockResolvedValue({
      user: { id: "11111111-1111-4111-8111-111111111111" },
      role: "business",
    });
    createServerClientMock.mockReturnValue(
      buildSupabaseMock({
        businessRow: {
          owner_user_id: "11111111-1111-4111-8111-111111111111",
          business_name: "Cafe Uno",
          category: "Cafe",
          address: "",
          city: "Long Beach",
          state: "CA",
          postal_code: "90802",
        },
      })
    );

    const response = await middleware(makeRequest("/business/dashboard"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/onboarding");
  });
});
