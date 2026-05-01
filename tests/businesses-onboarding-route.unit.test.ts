import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/businesses/route";

const { createSupabaseRouteHandlerClientMock } = vi.hoisted(() => ({
  createSupabaseRouteHandlerClientMock: vi.fn(),
}));

vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseRouteHandlerClient: createSupabaseRouteHandlerClientMock,
}));

function createRequest(body = {}) {
  return new Request("http://localhost:3000/api/businesses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Cafe Uno",
      category: "Cafe",
      description: "Great coffee",
      address: "123 Main St",
      city: "Long Beach",
      state: "CA",
      postal_code: "90802",
      ...body,
    }),
  });
}

function createSupabaseMock({
  rpcError = null,
  businessRowOverride = {},
  businessUpsertError = null,
  userUpsertError = null,
} = {}) {
  const businessRow = {
    id: "biz-1",
    owner_user_id: "11111111-1111-4111-8111-111111111111",
    public_id: "abc123",
    business_name: "Cafe Uno",
    category: "Cafe",
    address: "123 Main St",
    city: "Long Beach",
    state: "CA",
    postal_code: "90802",
    verification_status: "pending",
    ...businessRowOverride,
  };

  const usersTable = {
    upsert: vi.fn().mockResolvedValue({
      error: userUpsertError,
    }),
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { public_id: "abc123", is_internal: false },
          error: null,
        }),
      })),
    })),
  };

  const businessesTable = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { is_internal: false, latitude: null, longitude: null },
          error: null,
        }),
      })),
    })),
    upsert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: businessRow,
          error: businessUpsertError,
        }),
      })),
    })),
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: "11111111-1111-4111-8111-111111111111",
            email: "biz@example.com",
          },
        },
        error: null,
      }),
    },
    rpc: vi.fn().mockResolvedValue({ error: rpcError }),
    from: vi.fn((table) => {
      if (table === "users") return usersTable;
      if (table === "businesses") return businessesTable;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe("POST /api/businesses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_GEOCODING_API_KEY = "";
  });

  it("returns 400 when set_my_role_business RPC fails", async () => {
    const supabase = createSupabaseMock({
      rpcError: { code: "42501", message: "permission denied" },
    });
    createSupabaseRouteHandlerClientMock.mockReturnValue(supabase);

    const response = await POST(createRequest());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "permission denied",
    });
    expect(supabase.rpc).toHaveBeenCalledWith("set_my_role_business");
  });

  it("returns 400 when business row is still incomplete after successful RPC", async () => {
    const supabase = createSupabaseMock({
      businessRowOverride: {
        address: "",
      },
    });
    createSupabaseRouteHandlerClientMock.mockReturnValue(supabase);

    const response = await POST(createRequest());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Business profile is incomplete after save.",
    });
    expect(supabase.rpc).toHaveBeenCalledWith("set_my_role_business");
  });

  it("syncs users.full_name and users.business_name to the submitted business name", async () => {
    const supabase = createSupabaseMock();
    createSupabaseRouteHandlerClientMock.mockReturnValue(supabase);

    const response = await POST(createRequest({ name: "Pan Dulce Market" }));
    expect(response.status).toBe(200);

    expect(supabase.from).toHaveBeenCalledWith("users");
    expect(supabase.from("users").upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "11111111-1111-4111-8111-111111111111",
        role: "business",
        full_name: "Pan Dulce Market",
        business_name: "Pan Dulce Market",
      }),
      {
        onConflict: "id",
        ignoreDuplicates: false,
      }
    );
  });

  it("saves submitted phone to business record and not user account record", async () => {
    const supabase = createSupabaseMock({
      businessRowOverride: {
        phone: "(562) 123-4567",
      },
    });
    createSupabaseRouteHandlerClientMock.mockReturnValue(supabase);

    const response = await POST(createRequest({ phone: "+1 562 123 4567" }));
    expect(response.status).toBe(200);

    expect(supabase.from("users").upsert).toHaveBeenCalledWith(
      expect.not.objectContaining({
        phone: expect.anything(),
      }),
      expect.any(Object)
    );
    expect(supabase.from("businesses").upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "(562) 123-4567",
      }),
      {
        onConflict: "owner_user_id",
        ignoreDuplicates: false,
      }
    );
  });

  it("rejects incomplete non-empty onboarding phone numbers", async () => {
    const supabase = createSupabaseMock();
    createSupabaseRouteHandlerClientMock.mockReturnValue(supabase);

    const response = await POST(createRequest({ phone: "562" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Enter a complete 10-digit US phone number.",
    });
  });

  it("returns success only when RPC succeeds and business row is complete", async () => {
    const supabase = createSupabaseMock();
    createSupabaseRouteHandlerClientMock.mockReturnValue(supabase);

    const response = await POST(createRequest());
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.owner_user_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(payload.row.business_name).toBe("Cafe Uno");
    expect(supabase.rpc).toHaveBeenCalledWith("set_my_role_business");
  });
});
