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

function buildSupabaseMock() {
  return {
    rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "missing session" } }),
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn((table) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: table === "users" ? { account_status: "active", password_set: true } : null,
            error: null,
          }),
        })),
      })),
    })),
  };
}

describe("middleware customer auth entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServerClientMock.mockReturnValue(buildSupabaseMock());
    resolveCurrentUserRoleFromClientMock.mockResolvedValue({ user: null, role: null });
  });

  it("allows guest public business profile routes to load anonymously", async () => {
    const response = await middleware(makeRequest("/b/test-business"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not bounce legacy customer business profile routes when auth cookies exist but user has not resolved yet", async () => {
    const response = await middleware(
      makeRequest("/customer/b/test-business", "sb-test-auth-token=fake-session")
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not redirect authenticated users away from legacy customer business profile routes", async () => {
    resolveCurrentUserRoleFromClientMock.mockResolvedValue({
      user: { id: "user-1" },
      role: "business",
    });

    const response = await middleware(makeRequest("/customer/b/test-business"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("allows guest customer routes to load so the login modal can open on the same URL", async () => {
    const response = await middleware(makeRequest("/customer/orders"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects stale unauthenticated customer routes to the public landing page", async () => {
    const response = await middleware(
      makeRequest("/customer/orders", "sb-test-auth-token=fake-session")
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });
});
