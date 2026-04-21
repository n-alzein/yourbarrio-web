import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DELETE as unsaveListing,
  POST as saveListing,
} from "@/app/api/customer/saved-listings/route";
import { POST as saveBusiness } from "@/app/api/customer/saved-businesses/route";

const { getSupabaseServerClientMock, getUserCachedMock } = vi.hoisted(() => ({
  getSupabaseServerClientMock: vi.fn(),
  getUserCachedMock: vi.fn(),
}));

vi.mock("@/lib/supabaseServer", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
  getUserCached: getUserCachedMock,
}));

function createRequest(path: string, body: Record<string, unknown>) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createSupabaseMock(role: string) {
  const savedInsert = vi.fn().mockResolvedValue({ error: null });
  const usersMaybeSingle = vi.fn().mockResolvedValue({ data: { role }, error: null });

  return {
    from: vi.fn((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: usersMaybeSingle,
            })),
          })),
        };
      }
      if (table === "saved_listings" || table === "saved_businesses") {
        return {
          insert: savedInsert,
          upsert: savedInsert,
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
    __mocks: {
      savedInsert,
    },
  };
}

describe("customer save API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserCachedMock.mockResolvedValue({
      user: { id: "user-1" },
      error: null,
    });
  });

  it("rejects business users saving listings", async () => {
    const supabase = createSupabaseMock("business");
    getSupabaseServerClientMock.mockResolvedValue(supabase);

    const response = await saveListing(
      createRequest("/api/customer/saved-listings", { listingId: "listing-1" })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Business accounts cannot save listings.",
    });
    expect(supabase.__mocks.savedInsert).not.toHaveBeenCalled();
  });

  it("rejects business users saving business profiles", async () => {
    const supabase = createSupabaseMock("business");
    getSupabaseServerClientMock.mockResolvedValue(supabase);

    const response = await saveBusiness(
      createRequest("/api/customer/saved-businesses", { businessId: "business-1" })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Business accounts cannot save businesses.",
    });
    expect(supabase.__mocks.savedInsert).not.toHaveBeenCalled();
  });

  it("allows customer users to save listings", async () => {
    const supabase = createSupabaseMock("customer");
    getSupabaseServerClientMock.mockResolvedValue(supabase);

    const response = await saveListing(
      createRequest("/api/customer/saved-listings", { listingId: "listing-1" })
    );

    expect(response.status).toBe(200);
    expect(supabase.__mocks.savedInsert).toHaveBeenCalledWith({
      user_id: "user-1",
      listing_id: "listing-1",
    });
  });

  it("rejects business users unsaving listings", async () => {
    const supabase = createSupabaseMock("business");
    getSupabaseServerClientMock.mockResolvedValue(supabase);

    const response = await unsaveListing(
      createRequest("/api/customer/saved-listings", { listingId: "listing-1" })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Business accounts cannot save listings.",
    });
  });
});
