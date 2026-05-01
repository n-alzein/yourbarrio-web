import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/business/profile/route";

const { createSupabaseRouteHandlerClientMock } = vi.hoisted(() => ({
  createSupabaseRouteHandlerClientMock: vi.fn(),
}));

vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseRouteHandlerClient: createSupabaseRouteHandlerClientMock,
}));

vi.mock("@/lib/location/businessGeocoding", () => ({
  resolveBusinessCoordinates: vi.fn(async () => ({ coords: null })),
}));

function createRequest(body = {}) {
  return new Request("http://localhost:3000/api/business/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business_name: "Barrio Market",
      full_name: "Barrio Market",
      business_type: "retail",
      category: "retail",
      description: "A neighborhood market with locally made goods and pantry staples.",
      website: "",
      phone: "",
      email: "owner@example.com",
      address: "123 Main St",
      city: "Long Beach",
      ...body,
    }),
  });
}

function createSupabaseMock() {
  const userRow = {
    id: "user-1",
    public_id: "abc123",
    is_internal: false,
    full_name: "Barrio Market",
    business_name: "Barrio Market",
    business_type: "retail",
    category: "retail",
    description: "A neighborhood market with locally made goods and pantry staples.",
    website: "",
    phone: "",
    email: "owner@example.com",
    address: "123 Main St",
    address_2: "",
    city: "Long Beach",
    state: "",
    postal_code: "",
    profile_photo_url: "",
    cover_photo_url: "",
    latitude: null,
    longitude: null,
    hours_json: null,
    social_links_json: null,
  };
  const businessRow = {
    owner_user_id: "user-1",
    public_id: "abc123",
    is_internal: false,
    business_name: "Barrio Market",
    business_type: "retail",
    category: "retail",
    description: "A neighborhood market with locally made goods and pantry staples.",
    website: "",
    phone: "",
    address: "123 Main St",
    address_2: "",
    city: "Long Beach",
    state: "",
    postal_code: "",
    profile_photo_url: "",
    cover_photo_url: "",
    latitude: null,
    longitude: null,
    hours_json: null,
    social_links_json: null,
    pickup_enabled_default: true,
    local_delivery_enabled_default: false,
    default_delivery_fee_cents: null,
    delivery_radius_miles: null,
    delivery_min_order_cents: null,
    delivery_notes: null,
  };

  let usersUpdatePayload = null;
  let businessUpsertPayload = null;

  const usersTable = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: userRow, error: null }),
      })),
    })),
    update: vi.fn((payload) => {
      usersUpdatePayload = payload;
      return {
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { ...userRow, ...usersUpdatePayload },
              error: null,
            }),
          })),
        })),
      };
    }),
  };

  const businessesTable = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: businessRow, error: null }),
      })),
    })),
    upsert: vi.fn((payload) => {
      businessUpsertPayload = payload;
      return {
        select: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { ...businessRow, ...businessUpsertPayload },
            error: null,
          }),
        })),
      };
    }),
  };

  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1", email: "owner@example.com" } },
        error: null,
      }),
    },
    from: vi.fn((table) => {
      if (table === "users") return usersTable;
      if (table === "businesses") return businessesTable;
      throw new Error(`Unexpected table: ${table}`);
    }),
    get usersUpdatePayload() {
      return usersUpdatePayload;
    },
    get businessUpsertPayload() {
      return businessUpsertPayload;
    },
  };

  return supabase;
}

describe("POST /api/business/profile phone normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores only normalized US display format on business record", async () => {
    const supabase = createSupabaseMock();
    createSupabaseRouteHandlerClientMock.mockReturnValue(supabase);

    const response = await POST(createRequest({ phone: "+1 562 123 4567" }));

    expect(response.status).toBe(200);
    expect(supabase.usersUpdatePayload).toEqual(
      expect.not.objectContaining({ phone: expect.anything() })
    );
    expect(supabase.businessUpsertPayload).toEqual(
      expect.objectContaining({ phone: "(562) 123-4567" })
    );
    const payload = await response.json();
    expect(payload.profile.phone).toBe("(562) 123-4567");
  });

  it("rejects incomplete non-empty phone numbers", async () => {
    const supabase = createSupabaseMock();
    createSupabaseRouteHandlerClientMock.mockReturnValue(supabase);

    const response = await POST(createRequest({ phone: "562" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Enter a complete 10-digit US phone number.",
    });
    expect(supabase.usersUpdatePayload).toBeNull();
    expect(supabase.businessUpsertPayload).toBeNull();
  });

  it("allows empty phone values", async () => {
    const supabase = createSupabaseMock();
    createSupabaseRouteHandlerClientMock.mockReturnValue(supabase);

    const response = await POST(createRequest({ phone: "" }));

    expect(response.status).toBe(200);
    expect(supabase.usersUpdatePayload).toEqual(
      expect.not.objectContaining({ phone: expect.anything() })
    );
    expect(supabase.businessUpsertPayload).toEqual(expect.objectContaining({ phone: null }));
  });
});
