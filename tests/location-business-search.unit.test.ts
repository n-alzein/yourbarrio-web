import { describe, expect, it, vi } from "vitest";
import { findBusinessesForLocation } from "@/lib/location/businessLocationSearch";

function createSupabaseMock(rows) {
  const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
  const inFn = vi.fn(() => ({ limit }));
  const select = vi.fn(() => ({ in: inFn }));
  const from = vi.fn(() => ({ select }));

  return {
    from,
    __mocks: {
      select,
      inFn,
      limit,
    },
  };
}

describe("findBusinessesForLocation", () => {
  it("keeps exact city+state matches with null coords when selected location has coords", async () => {
    const supabase = createSupabaseMock([
      {
        id: "ca-coords",
        owner_user_id: "owner-ca-coords",
        city: "Long Beach",
        state: "CA",
        latitude: 33.7701,
        longitude: -118.1937,
        verification_status: "manually_verified",
      },
      {
        id: "ca-null",
        owner_user_id: "owner-ca-null",
        city: "Long Beach",
        state: "CA",
        latitude: null,
        longitude: null,
        verification_status: "manually_verified",
      },
      {
        id: "ms-null",
        owner_user_id: "owner-ms-null",
        city: "Long Beach",
        state: "MS",
        latitude: null,
        longitude: null,
        verification_status: "manually_verified",
      },
    ]);

    const results = await findBusinessesForLocation(supabase, {
      city: "Long Beach",
      region: "California",
      lat: 33.7701,
      lng: -118.1937,
    });

    expect(results.map((row) => row.id)).toEqual(["ca-coords", "ca-null"]);
  });
});
