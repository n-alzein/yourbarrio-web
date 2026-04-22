import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureUserProvisionedForUserMock } = vi.hoisted(() => ({
  ensureUserProvisionedForUserMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_noStore: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: vi.fn(() => "localhost:3000"),
  }),
}));
vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseRouteHandlerClient: vi.fn(),
  getSupabaseServerAuthedClient: vi.fn(),
}));
vi.mock("@/lib/auth/ensureUserProvisioning", () => ({
  ensureUserProvisionedForUser: ensureUserProvisionedForUserMock,
}));

import { getCurrentAccountContext } from "@/lib/auth/getCurrentAccountContext";

function createSupabaseWithMissingThenRecoveredProfile() {
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "GoogleUser@Example.com",
    app_metadata: {},
    user_metadata: {
      full_name: "Google User",
      picture: "https://lh3.googleusercontent.com/google.jpg",
    },
  };
  const recoveredProfile = {
    id: user.id,
    email: "googleuser@example.com",
    role: "customer",
    full_name: "Google User",
    profile_photo_url: "https://lh3.googleusercontent.com/google.jpg",
  };
  const usersMaybeSingle = vi
    .fn()
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: recoveredProfile, error: null });
  const businessesMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const from = vi.fn((table: string) => {
    const maybeSingle = table === "users" ? usersMaybeSingle : businessesMaybeSingle;
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle,
        })),
      })),
    };
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: null,
      }),
    },
    from,
    __mocks: {
      user,
      recoveredProfile,
      usersMaybeSingle,
      businessesMaybeSingle,
    },
  };
}

describe("getCurrentAccountContext provisioning recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureUserProvisionedForUserMock.mockResolvedValue({
      userCreated: true,
      role: "customer",
    });
  });

  it("provisions and refetches public.users when auth user exists but profile row is missing", async () => {
    const supabase = createSupabaseWithMissingThenRecoveredProfile();

    const context = await getCurrentAccountContext({
      supabase,
      source: "unit_test",
    });

    expect(ensureUserProvisionedForUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: supabase.__mocks.user.id,
        email: "GoogleUser@Example.com",
        fallbackRole: "customer",
        source: "unit_test",
      })
    );
    expect(supabase.__mocks.usersMaybeSingle).toHaveBeenCalledTimes(2);
    expect(context.isAuthenticated).toBe(true);
    expect(context.user?.id).toBe(supabase.__mocks.user.id);
    expect(context.profile).toEqual(supabase.__mocks.recoveredProfile);
    expect(context.role).toBe("customer");
  });
});
