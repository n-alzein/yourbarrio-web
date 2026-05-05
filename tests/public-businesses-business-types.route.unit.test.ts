import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSupabaseServerClientMock,
  findBusinessesForLocationMock,
  getCurrentViewerVisibilityGateMock,
} = vi.hoisted(() => ({
  getSupabaseServerClientMock: vi.fn(),
  findBusinessesForLocationMock: vi.fn(),
  getCurrentViewerVisibilityGateMock: vi.fn(),
}));

vi.mock("@/lib/supabaseServer", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
}));

vi.mock("@/lib/location/businessLocationSearch", () => ({
  findBusinessesForLocation: findBusinessesForLocationMock,
}));

vi.mock("@/lib/publicVisibility", () => ({
  getCurrentViewerVisibilityGate: getCurrentViewerVisibilityGateMock,
}));

async function importRoute() {
  vi.resetModules();
  return import("@/app/api/public-businesses/route");
}

function createBusinessTypesQuery(rows: any[]) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    then(resolve: any) {
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
  };
  return query;
}

function createSupabaseMock(businessTypes: any[]) {
  return {
    from: vi.fn((table: string) => {
      if (table === "business_types") return createBusinessTypesQuery(businessTypes);
      if (table === "business_categories") {
        throw new Error("nearby should not query business_categories");
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe("GET /api/public-businesses business types", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentViewerVisibilityGateMock.mockResolvedValue({
      viewerCanSeeInternalContent: false,
    });
  });

  it("returns used active businessTypes without reading public.business_categories", async () => {
    const supabase = createSupabaseMock([
      { id: "type-boutique", slug: "boutique", name: "Boutique", is_active: true },
      { id: "type-tech", slug: "tech-shop", name: "Tech Shop", is_active: true },
      { id: "type-bookstore", slug: "bookstore", name: "Bookstore", is_active: true },
    ]);
    getSupabaseServerClientMock.mockResolvedValue(supabase);
    findBusinessesForLocationMock.mockResolvedValue([
      {
        id: "business-row-1",
        owner_user_id: "owner-1",
        business_name: "Seaside Threads",
        business_type_id: "type-boutique",
        business_type: "boutique",
        category: "Boutique",
        city: "Long Beach",
        state: "CA",
        latitude: 33.77,
        longitude: -118.19,
        verification_status: "auto_verified",
        account_status: "active",
      },
      {
        id: "business-row-2",
        owner_user_id: "owner-2",
        business_name: "Paper Harbor",
        business_type_id: "type-bookstore",
        business_type: "bookstore",
        category: "Bookstore",
        city: "Long Beach",
        state: "CA",
        latitude: 33.78,
        longitude: -118.2,
        verification_status: "manually_verified",
        account_status: "active",
      },
    ]);

    const { GET } = await importRoute();
    const response = await GET(
      new Request("http://localhost:3000/api/public-businesses?city=Long%20Beach&state=CA")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(supabase.from).toHaveBeenCalledWith("business_types");
    expect(supabase.from).not.toHaveBeenCalledWith("business_categories");
    expect(payload.businessTypes).toEqual([
      { id: "type-boutique", slug: "boutique", name: "Boutique" },
      { id: "type-bookstore", slug: "bookstore", name: "Bookstore" },
    ]);
    expect(payload.categories).toEqual(payload.businessTypes);
    expect(payload.businesses[0]).toMatchObject({
      business_type_id: "type-boutique",
      business_type_slug: "boutique",
      business_type_name: "Boutique",
      category: "Boutique",
    });
  });
});
