import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getAdminRoleMembersSelectMock } = vi.hoisted(() => ({
  getAdminRoleMembersSelectMock: vi.fn(),
}));

import { fetchAdminUsers } from "@/lib/admin/users";

function createClientForBusinessRpc() {
  return {
    rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
      if (fn !== "admin_list_accounts") {
        return Promise.resolve({ data: [], error: null });
      }

      expect(args.p_role).toBe("business");
      expect(args.p_internal).toBe(true);

      return Promise.resolve({
        data: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            email: "biz@example.com",
            full_name: "Business Owner",
            phone: null,
            business_name: "Barrio Shop",
            role: "business",
            is_internal: true,
            city: "Los Angeles",
            created_at: "2026-04-20T00:00:00.000Z",
            admin_role_keys: [],
            total_count: 1,
          },
        ],
        error: null,
      });
    }),
  };
}

function createClientForMixedServiceQuery() {
  const usersRows = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      public_id: "biz-111",
      email: "biz@example.com",
      full_name: "Business Owner",
      phone: null,
      business_name: "Barrio Shop",
      role: "business",
      is_internal: false,
      city: "Los Angeles",
      created_at: "2026-04-20T00:00:00.000Z",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      public_id: "usr-222",
      email: "customer@example.com",
      full_name: "Customer User",
      phone: null,
      business_name: null,
      role: "customer",
      is_internal: false,
      city: "Los Angeles",
      created_at: "2026-04-19T00:00:00.000Z",
    },
  ];

  return {
    from: vi.fn((table: string) => {
      if (table === "admin_role_members") {
        return {
          select: getAdminRoleMembersSelectMock.mockReturnValue({
            data: [],
            error: null,
          }),
        };
      }

      if (table === "users") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              range: vi.fn().mockResolvedValue({
                data: usersRows,
                count: usersRows.length,
                error: null,
              }),
            })),
          })),
        };
      }

      if (table === "businesses") {
        return {
          select: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  owner_user_id: "11111111-1111-4111-8111-111111111111",
                  is_internal: true,
                },
              ],
              error: null,
            }),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

function createClientForBusinessIdentifierSearch() {
  const businessUserRow = {
    id: "11111111-1111-4111-8111-111111111111",
    public_id: "usr-111",
    email: "biz@example.com",
    full_name: "Business Owner",
    phone: "(555) 333-4444",
    business_name: "Barrio Shop",
    role: "business",
    is_internal: false,
    city: "Los Angeles",
    created_at: "2026-04-20T00:00:00.000Z",
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "admin_role_members") {
        return {
          select: getAdminRoleMembersSelectMock.mockReturnValue({
            data: [],
            error: null,
          }),
        };
      }

      if (table === "businesses") {
        return {
          select: vi.fn(() => ({
            or: vi.fn((clause: string) =>
              Promise.resolve({
                data: clause.includes("33333333-3333-4333-8333-333333333333")
                  ? [{ owner_user_id: businessUserRow.id }]
                  : [],
                error: null,
              })
            ),
            ilike: vi.fn((column: string, value: string) =>
              Promise.resolve({
                data:
                  column === "public_id" && ["biz-111", "shop-111"].includes(value.toLowerCase())
                    ? [{ owner_user_id: businessUserRow.id }]
                    : [],
                error: null,
              })
            ),
            in: vi.fn(() =>
              Promise.resolve({
                data: [{ owner_user_id: businessUserRow.id, is_internal: false }],
                error: null,
              })
            ),
          })),
        };
      }

      if (table === "users") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() =>
              Promise.resolve({
                data: [businessUserRow],
                error: null,
              })
            ),
            ilike: vi.fn((column: string, value: string) =>
              Promise.resolve({
                data:
                  (column === "email" && value === "%biz@example.com%") ||
                  (column === "email" && value === "%Barrio Shop%")
                    ? [{ id: businessUserRow.id }]
                    : [],
                error: null,
              })
            ),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
    rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
      if (fn !== "admin_list_accounts") {
        return Promise.resolve({ data: [], error: null });
      }

      return Promise.resolve({
        data:
          args.p_q === "Barrio Shop" || args.p_q === "biz@example.com"
            ? [
                {
                  ...businessUserRow,
                  admin_role_keys: [],
                  total_count: 1,
                },
              ]
            : [],
        error: null,
      });
    }),
  };
}

describe("fetchAdminUsers internal semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses admin_list_accounts for business lists so business internal status comes from businesses.is_internal", async () => {
    const client = createClientForBusinessRpc();

    const result = await fetchAdminUsers({
      client,
      usingServiceRole: true,
      role: "business",
      includeInternal: true,
      from: 0,
      to: 9,
    });

    expect(client.rpc).toHaveBeenCalledWith(
      "admin_list_accounts",
      expect.objectContaining({
        p_role: "business",
        p_internal: true,
      })
    );
    expect(result.rows[0]?.is_internal).toBe(true);
    expect(result.rows[0]?.account_role).toBe("business");
  });

  it("overrides business row display state with businesses.is_internal on mixed service-role account lists", async () => {
    const client = createClientForMixedServiceQuery();

    const result = await fetchAdminUsers({
      client,
      usingServiceRole: true,
      role: "all",
      from: 0,
      to: 9,
    });

    expect(result.rows.find((row) => row.id === "11111111-1111-4111-8111-111111111111")?.is_internal).toBe(
      true
    );
    expect(result.rows.find((row) => row.id === "22222222-2222-4222-8222-222222222222")?.is_internal).toBe(
      false
    );
  });

  it("finds business rows by exact business UUID", async () => {
    const client = createClientForBusinessIdentifierSearch();

    const result = await fetchAdminUsers({
      client,
      usingServiceRole: true,
      role: "business",
      q: "33333333-3333-4333-8333-333333333333",
      from: 0,
      to: 9,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.business_name).toBe("Barrio Shop");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("finds business rows by formatted YB-BIZ id", async () => {
    const client = createClientForBusinessIdentifierSearch();

    const result = await fetchAdminUsers({
      client,
      usingServiceRole: true,
      role: "business",
      q: "YB-BIZ-biz-111",
      from: 0,
      to: 9,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("finds business rows by raw business public id", async () => {
    const client = createClientForBusinessIdentifierSearch();

    const result = await fetchAdminUsers({
      client,
      usingServiceRole: true,
      role: "business",
      q: "shop-111",
      from: 0,
      to: 9,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.business_name).toBe("Barrio Shop");
  });

  it("keeps business name search working through the existing RPC path", async () => {
    const client = createClientForBusinessIdentifierSearch();

    const result = await fetchAdminUsers({
      client,
      usingServiceRole: true,
      role: "business",
      q: "Barrio Shop",
      from: 0,
      to: 9,
    });

    expect(result.rows).toHaveLength(1);
    expect(client.rpc).toHaveBeenCalledWith(
      "admin_list_accounts",
      expect.objectContaining({ p_q: "Barrio Shop" })
    );
  });

  it("keeps business email search working through the existing RPC path", async () => {
    const client = createClientForBusinessIdentifierSearch();

    const result = await fetchAdminUsers({
      client,
      usingServiceRole: true,
      role: "business",
      q: "biz@example.com",
      from: 0,
      to: 9,
    });

    expect(result.rows).toHaveLength(1);
    expect(client.rpc).toHaveBeenCalledWith(
      "admin_list_accounts",
      expect.objectContaining({ p_q: "biz@example.com" })
    );
  });

  it("returns an empty result for an invalid formatted business identifier", async () => {
    const client = createClientForBusinessIdentifierSearch();

    const result = await fetchAdminUsers({
      client,
      usingServiceRole: true,
      role: "business",
      q: "YB-BIZ-does-not-exist",
      from: 0,
      to: 9,
    });

    expect(result.rows).toEqual([]);
    expect(result.count).toBe(0);
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
