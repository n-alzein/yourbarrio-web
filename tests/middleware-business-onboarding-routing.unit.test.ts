import { describe, expect, it, beforeEach, vi } from "vitest";
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

function makeRequest(pathname: string, cookie = "") {
  return new NextRequest(`http://localhost:3000${pathname}`, {
    headers: {
      "sec-fetch-mode": "navigate",
      "sec-fetch-dest": "document",
      "sec-fetch-user": "?1",
      ...(cookie ? { cookie } : {}),
    },
  });
}

function buildSupabaseMock({
  businessRow = null,
  accountStatus = "active",
  passwordSet = true,
}: {
  businessRow?: any;
  accountStatus?: string;
  passwordSet?: boolean;
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
                data: { account_status: accountStatus, password_set: passwordSet },
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

  it("allows guest /onboarding to load so the business login modal can open on the same URL", async () => {
    const response = await middleware(makeRequest("/onboarding"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects stale unauthenticated /onboarding traffic to /business", async () => {
    const response = await middleware(
      makeRequest("/onboarding", "sb-test-auth-token=fake-session")
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/business");
  });

  it("allows guest /business/dashboard to load so the business login modal can open", async () => {
    const response = await middleware(makeRequest("/business/dashboard"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects stale unauthenticated /business/dashboard traffic to /business", async () => {
    const response = await middleware(
      makeRequest("/business/dashboard", "sb-test-auth-token=fake-session")
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/business");
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

  it("redirects authenticated business without password setup from /onboarding to create-password", async () => {
    resolveCurrentUserRoleFromClientMock.mockResolvedValue({
      user: { id: "11111111-1111-4111-8111-111111111111" },
      role: "business",
    });
    createServerClientMock.mockReturnValue(
      buildSupabaseMock({
        passwordSet: false,
      })
    );

    const response = await middleware(makeRequest("/onboarding"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/business-auth/create-password"
    );
  });
});
