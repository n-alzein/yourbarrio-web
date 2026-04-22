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

function makeRequest(pathname: string, cookie = "sb-test-auth-token=fake-session") {
  return new NextRequest(`http://localhost:3000${pathname}`, {
    headers: {
      "sec-fetch-mode": "navigate",
      "sec-fetch-dest": "document",
      "sec-fetch-user": "?1",
      cookie,
    },
  });
}

function makeWwwDocumentRequest(pathname: string) {
  return new NextRequest(`https://www.yourbarrio.com${pathname}`, {
    headers: {
      host: "www.yourbarrio.com",
      "x-forwarded-host": "www.yourbarrio.com",
      "x-forwarded-proto": "https",
      "sec-fetch-mode": "navigate",
      "sec-fetch-dest": "document",
      "sec-fetch-user": "?1",
    },
  });
}

function buildSupabaseMock() {
  return {
    rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "missing session" } }),
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { account_status: "active", password_set: true },
            error: null,
          }),
        })),
      })),
    })),
  };
}

function seedRefreshedAuthCookie(options: any) {
  options.cookies.setAll([
    {
      name: "sb-test-auth-token",
      value: "refreshed-session",
      options: {
        path: "/",
        sameSite: "lax",
        httpOnly: true,
        maxAge: 3600,
      },
    },
  ]);
}

describe("middleware OAuth cookie handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServerClientMock.mockImplementation((_url, _key, options) => {
      seedRefreshedAuthCookie(options);
      return buildSupabaseMock();
    });
  });

  it("preserves full Supabase cookie attributes when redirecting immediately after auth", async () => {
    resolveCurrentUserRoleFromClientMock.mockResolvedValue({
      user: { id: "business-user" },
      role: "business",
    });

    const response = await middleware(makeRequest("/customer/orders"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/business/dashboard");
    const setCookie = response.headers.get("set-cookie") || "";
    expect(setCookie).toContain("sb-test-auth-token=refreshed-session");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).toContain("Max-Age=3600");
  });

  it("does not downgrade a valid post-callback customer session to guest", async () => {
    resolveCurrentUserRoleFromClientMock.mockResolvedValue({
      user: { id: "customer-user" },
      role: "customer",
    });

    const response = await middleware(makeRequest("/customer/orders"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(resolveCurrentUserRoleFromClientMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get("set-cookie")).toContain(
      "sb-test-auth-token=refreshed-session"
    );
  });

  it("redirects www document navigations to the apex production host before auth handling", async () => {
    const response = await middleware(makeWwwDocumentRequest("/customer/home?tab=orders"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://yourbarrio.com/customer/home?tab=orders"
    );
    expect(createServerClientMock).not.toHaveBeenCalled();
    expect(resolveCurrentUserRoleFromClientMock).not.toHaveBeenCalled();
  });
});
