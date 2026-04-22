import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";

const { getSupabaseServerClientMock } = vi.hoisted(() => ({
  getSupabaseServerClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
}));

import { ensureUserProvisionedForUser } from "@/lib/auth/ensureUserProvisioning";

function createClient({
  existingUser = null,
  selectError = null,
  upsertError = null,
}: {
  existingUser?: Record<string, unknown> | null;
  selectError?: { message?: string } | null;
  upsertError?: { message?: string } | null;
} = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: existingUser, error: selectError });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const upsert = vi.fn().mockResolvedValue({ error: upsertError });
  const from = vi.fn(() => ({ select, upsert }));

  return {
    from,
    __mocks: {
      maybeSingle,
      eq,
      select,
      upsert,
    },
  };
}

describe("ensureUserProvisionedForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a baseline customer user row when only auth user exists", async () => {
    const client = createClient();
    getSupabaseServerClientMock.mockReturnValue(client);

    const result = await ensureUserProvisionedForUser({
      userId: "11111111-1111-4111-8111-111111111111",
      email: "NewUser@Example.com",
      fallbackRole: null,
      source: "unit_test",
    });

    expect(result).toEqual({
      userCreated: true,
      role: "customer",
    });
    expect(client.__mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "11111111-1111-4111-8111-111111111111",
        email: "newuser@example.com",
        role: "customer",
        full_name: "",
      }),
      { onConflict: "id", ignoreDuplicates: false }
    );
  });

  it("preserves an existing business role when the row already exists", async () => {
    const client = createClient({
      existingUser: {
        id: "11111111-1111-4111-8111-111111111111",
        role: "business",
        is_internal: false,
        password_set: true,
      },
    });
    getSupabaseServerClientMock.mockReturnValue(client);

    const result = await ensureUserProvisionedForUser({
      userId: "11111111-1111-4111-8111-111111111111",
      email: "biz@example.com",
      fallbackRole: "customer",
      source: "unit_test",
    });

    expect(result).toEqual({
      userCreated: false,
      role: "business",
    });
    expect(client.__mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "business",
        password_set: true,
      }),
      { onConflict: "id", ignoreDuplicates: false }
    );
  });

  it("has a database trigger migration for auth.users profile provisioning", () => {
    const migration = fs.readFileSync(
      "supabase/migrations/20260422120000_auth_user_profile_provisioning.sql",
      "utf8"
    );

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.handle_auth_user_profile_provisioning");
    expect(migration).toContain("AFTER INSERT ON auth.users");
    expect(migration).toContain("LEFT JOIN public.users pu ON pu.id = au.id");
    expect(migration).toContain("WHERE pu.id IS NULL");
  });
});
