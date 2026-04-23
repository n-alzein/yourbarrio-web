import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  cookiesMock,
  createServerClientMock,
  ensureUserProvisionedForUserMock,
  ensureBusinessProvisionedForUserMock,
  getBusinessPasswordGateStateMock,
  isBusinessIntentPathMock,
  resolvePostAuthDestinationMock,
} = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  createServerClientMock: vi.fn(),
  ensureUserProvisionedForUserMock: vi.fn(),
  ensureBusinessProvisionedForUserMock: vi.fn(),
  getBusinessPasswordGateStateMock: vi.fn(),
  isBusinessIntentPathMock: vi.fn(),
  resolvePostAuthDestinationMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("@/lib/auth/ensureUserProvisioning", () => ({
  ensureUserProvisionedForUser: ensureUserProvisionedForUserMock,
}));

vi.mock("@/lib/auth/ensureBusinessProvisioning", () => ({
  ensureBusinessProvisionedForUser: ensureBusinessProvisionedForUserMock,
}));

vi.mock("@/lib/auth/businessPasswordGate", () => ({
  getBusinessPasswordGateState: getBusinessPasswordGateStateMock,
  isBusinessIntentPath: isBusinessIntentPathMock,
  resolvePostAuthDestination: resolvePostAuthDestinationMock,
}));

function makeCookieStore() {
  const cookiesByName = new Map<string, { name: string; value: string; options?: any }>();
  return {
    getAll: vi.fn(() =>
      Array.from(cookiesByName.values()).map(({ name, value }) => ({ name, value }))
    ),
    set: vi.fn((name: string, value: string, options?: any) => {
      cookiesByName.set(name, { name, value, options });
    }),
  };
}

function makeRequest(url: string, host = "yourbarrio.com") {
  return new Request(url, {
    headers: {
      host,
      "x-forwarded-proto": "https",
      "x-forwarded-host": host,
    },
  });
}

async function importRoute() {
  vi.resetModules();
  return import("../app/api/auth/callback/route.js");
}

describe("auth callback session handoff", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://crskbfbleiubpkvyvvlf.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.yourbarrio.com");
    cookiesMock.mockResolvedValue(makeCookieStore());
    ensureUserProvisionedForUserMock.mockResolvedValue(undefined);
    ensureBusinessProvisionedForUserMock.mockResolvedValue(undefined);
    isBusinessIntentPathMock.mockReturnValue(false);
    getBusinessPasswordGateStateMock.mockResolvedValue({
      role: "customer",
      accountStatus: "active",
      userRow: { id: "user-1", role: "customer" },
      businessRow: null,
      passwordSet: true,
      onboardingComplete: false,
    });
    resolvePostAuthDestinationMock.mockReturnValue("/customer/home");
  });

  it("keeps Supabase auth cookies on the final redirect after code exchange", async () => {
    createServerClientMock.mockImplementation((_url, _key, options) => ({
      auth: {
        exchangeCodeForSession: vi.fn(async () => {
          options.cookies.setAll([
            {
              name: "sb-crskbfbleiubpkvyvvlf-auth-token",
              value: "persisted-session",
              options: { httpOnly: true, sameSite: "lax", path: "/", maxAge: 3600 },
            },
          ]);
          return {
            data: {
              session: { access_token: "access" },
              user: { id: "user-1", email: "user@example.com" },
            },
            error: null,
          };
        }),
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "access" } },
          error: null,
        }),
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1", email: "user@example.com" } },
          error: null,
        }),
      },
    }));
    const { GET } = await importRoute();

    const response = await GET(
      makeRequest("https://yourbarrio.com/api/auth/callback?code=oauth-code&next=/customer/home")
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toMatch(
      /^https:\/\/www\.yourbarrio\.com\/customer\/home\?yb_auth_handoff=1&yb_auth_fresh=/
    );
    expect(response.headers.get("x-auth-callback-has-cookies")).toBe("1");
    expect(response.headers.get("x-auth-callback-has-set-cookie")).toBe("1");
    expect(response.headers.get("set-cookie")).toContain(
      "sb-crskbfbleiubpkvyvvlf-auth-token=persisted-session"
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
  });

  it("does not redirect to login when app-profile provisioning fails after a valid session exchange", async () => {
    ensureUserProvisionedForUserMock.mockRejectedValueOnce(
      new Error("Missing service role Supabase client")
    );
    createServerClientMock.mockImplementation((_url, _key, options) => ({
      auth: {
        exchangeCodeForSession: vi.fn(async () => {
          options.cookies.setAll([
            {
              name: "sb-crskbfbleiubpkvyvvlf-auth-token",
              value: "persisted-session",
              options: { httpOnly: true, sameSite: "lax", path: "/", maxAge: 3600 },
            },
          ]);
          return {
            data: {
              session: { access_token: "access" },
              user: { id: "user-1", email: "user@example.com" },
            },
            error: null,
          };
        }),
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "access" } },
          error: null,
        }),
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1", email: "user@example.com" } },
          error: null,
        }),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      })),
    }));
    getBusinessPasswordGateStateMock.mockResolvedValueOnce({
      role: null,
      accountStatus: "active",
      userRow: null,
      businessRow: null,
      passwordSet: false,
      onboardingComplete: false,
    });
    resolvePostAuthDestinationMock.mockReturnValueOnce("/customer/home");
    const { GET } = await importRoute();

    const response = await GET(
      makeRequest("https://yourbarrio.com/api/auth/callback?code=oauth-code&next=/customer/home")
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toMatch(
      /^https:\/\/www\.yourbarrio\.com\/customer\/home\?yb_auth_handoff=1&yb_auth_fresh=/
    );
    expect(response.headers.get("location")).not.toContain("/login");
    expect(response.headers.get("x-auth-callback-has-cookies")).toBe("1");
    expect(response.headers.get("x-auth-callback-has-set-cookie")).toBe("1");
    expect(response.headers.get("set-cookie")).toContain(
      "sb-crskbfbleiubpkvyvvlf-auth-token=persisted-session"
    );
  });

  it("fails invalid code exchange safely without setting auth cookies", async () => {
    createServerClientMock.mockReturnValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: { session: null, user: null },
          error: { message: "invalid authorization code", code: "invalid_grant" },
        }),
        getSession: vi.fn(),
        getUser: vi.fn(),
      },
    });
    const { GET } = await importRoute();

    const response = await GET(
      makeRequest("https://yourbarrio.com/api/auth/callback?code=bad-code&next=/customer/home")
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://www.yourbarrio.com/login?next=%2Fcustomer%2Fhome&auth=magic_link_expired"
    );
    expect(response.headers.get("x-auth-callback-has-cookies")).toBe("0");
    expect(response.headers.get("x-auth-callback-has-set-cookie")).toBe("0");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
