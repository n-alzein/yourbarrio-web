import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";

const { getSupabaseServerClientMock } = vi.hoisted(() => ({
  getSupabaseServerClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
}));

import {
  ensureUserProvisionedForUser,
  isTombstonedUserRow,
} from "@/lib/auth/ensureUserProvisioning";

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
      userRepaired: false,
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
        email: "biz@example.com",
        role: "business",
        full_name: "Real Business Owner",
        profile_photo_url: "https://cdn.example.com/owner.jpg",
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
      userRepaired: false,
      role: "business",
    });
    expect(client.__mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "business",
        email: "biz@example.com",
        full_name: "Real Business Owner",
        profile_photo_url: "https://cdn.example.com/owner.jpg",
        password_set: true,
      }),
      { onConflict: "id", ignoreDuplicates: false }
    );
  });

  it("preserves valid active app profile fields instead of overwriting them with auth metadata", async () => {
    const client = createClient({
      existingUser: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "active@example.com",
        role: "customer",
        full_name: "Chosen App Name",
        profile_photo_url: "https://cdn.example.com/app-avatar.jpg",
        account_status: "active",
        is_internal: false,
        password_set: false,
      },
    });
    getSupabaseServerClientMock.mockReturnValue(client);

    const result = await ensureUserProvisionedForUser({
      userId: "11111111-1111-4111-8111-111111111111",
      email: "google@example.com",
      fullName: "Google Name",
      avatarUrl: "https://lh3.googleusercontent.com/google.jpg",
      fallbackRole: "business",
      source: "unit_test",
    });

    expect(result).toEqual({
      userCreated: false,
      userRepaired: false,
      role: "customer",
    });
    expect(client.__mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "active@example.com",
        full_name: "Chosen App Name",
        profile_photo_url: "https://cdn.example.com/app-avatar.jpg",
        role: "customer",
      }),
      { onConflict: "id", ignoreDuplicates: false }
    );
  });

  it("repairs tombstoned placeholder rows from the active auth identity", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const client = createClient({
      existingUser: {
        id: userId,
        email: `deleted+${userId}@deleted.local`,
        role: "customer",
        full_name: "Deleted user",
        business_name: "Deleted user",
        profile_photo_url: null,
        account_status: "deleted",
        deleted_at: "2026-04-01T00:00:00.000Z",
        anonymized_at: "2026-04-01T00:00:00.000Z",
        is_internal: false,
        password_set: false,
      },
    });
    getSupabaseServerClientMock.mockReturnValue(client);

    const result = await ensureUserProvisionedForUser({
      userId,
      email: "RestoredUser@Example.com",
      fullName: "Restored User",
      avatarUrl: "https://lh3.googleusercontent.com/restored.jpg",
      fallbackRole: "business",
      source: "unit_test",
    });

    expect(result).toEqual({
      userCreated: false,
      userRepaired: true,
      role: "customer",
    });
    expect(client.__mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: userId,
        email: "restoreduser@example.com",
        role: "customer",
        full_name: "Restored User",
        profile_photo_url: "https://lh3.googleusercontent.com/restored.jpg",
        business_name: null,
        account_status: "active",
        deleted_at: null,
        anonymized_at: null,
      }),
      { onConflict: "id", ignoreDuplicates: false }
    );
  });

  it("detects all known tombstone markers", () => {
    expect(isTombstonedUserRow({ id: "u1", email: "deleted+u1@deleted.local" })).toBe(true);
    expect(isTombstonedUserRow({ id: "u1", email: "deleted+u1@yourbarrio.invalid" })).toBe(
      true
    );
    expect(isTombstonedUserRow({ id: "u1", full_name: "Deleted user" })).toBe(true);
    expect(isTombstonedUserRow({ id: "u1", business_name: "Deleted user" })).toBe(true);
    expect(isTombstonedUserRow({ id: "u1", account_status: "deleted" })).toBe(true);
    expect(isTombstonedUserRow({ id: "u1", deleted_at: "2026-04-01T00:00:00.000Z" })).toBe(
      true
    );
    expect(isTombstonedUserRow({ id: "u1", anonymized_at: "2026-04-01T00:00:00.000Z" })).toBe(
      true
    );
    expect(isTombstonedUserRow({ id: "u1", email: "active@example.com" })).toBe(false);
  });

  it("has a database trigger migration for auth.users profile provisioning", () => {
    const migration = fs.readFileSync(
      "supabase/migrations/20260422120000_auth_user_profile_provisioning.sql",
      "utf8"
    );

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.handle_auth_user_profile_provisioning");
    expect(migration).toContain("AFTER INSERT ON auth.users");
    expect(migration).toContain("LEFT JOIN public.users pu ON pu.id = au.id");
    expect(migration).toContain("pu.id IS NULL");
    expect(migration).toContain("deleted+%@deleted.local");
    expect(migration).toContain("deleted+%@yourbarrio.invalid");
    expect(migration).toContain("pu.full_name = 'Deleted user'");
    expect(migration).toContain("pu.anonymized_at IS NOT NULL");
  });
});
