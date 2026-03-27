import { describe, expect, it } from "vitest";
import {
  filterByLocation,
  getNormalizedLocation,
  hasUsableLocationFilter,
  matchesLocationCandidate,
  normalizeStateCode,
} from "@/lib/location/filter";

describe("location filter", () => {
  it("normalizes state names and abbreviations to USPS codes", () => {
    expect(normalizeStateCode("California")).toBe("CA");
    expect(normalizeStateCode("ca")).toBe("CA");
    expect(normalizeStateCode("Mississippi")).toBe("MS");
    expect(normalizeStateCode("ms")).toBe("MS");
  });

  it("includes in-radius coords and exact city+state coordless rows for Long Beach, CA with coords", () => {
    const selected = getNormalizedLocation({
      city: "Long Beach",
      region: "California",
      lat: 33.7701,
      lng: -118.1937,
    });
    const rows = [
      {
        id: "ca-coords",
        city: "Long Beach",
        state: "CA",
        latitude: 33.7701,
        longitude: -118.1937,
      },
      {
        id: "ca-null",
        city: "Long Beach",
        state: "CA",
        latitude: null,
        longitude: null,
      },
      {
        id: "ms-null",
        city: "Long Beach",
        state: "MS",
        latitude: null,
        longitude: null,
      },
      {
        id: "ms-coords",
        city: "Long Beach",
        state: "MS",
        latitude: 30.3500,
        longitude: -89.1500,
      },
    ];

    expect(hasUsableLocationFilter(selected)).toBe(true);
    expect(matchesLocationCandidate(rows[0], selected)).toBe(true);
    expect(matchesLocationCandidate(rows[1], selected)).toBe(true);
    expect(matchesLocationCandidate(rows[2], selected)).toBe(false);
    expect(matchesLocationCandidate(rows[3], selected)).toBe(false);
    expect(filterByLocation(rows, selected).map((row) => row.id)).toEqual([
      "ca-coords",
      "ca-null",
    ]);
  });

  it("requires exact city+state when Long Beach, CA is selected without coords", () => {
    const selected = {
      city: "Long Beach",
      region: "ca",
    };
    const rows = [
      { id: "ca-null", city: "Long Beach", state: "CA", latitude: null, longitude: null },
      { id: "ms-null", city: "Long Beach", state: "MS", latitude: null, longitude: null },
    ];

    expect(filterByLocation(rows, selected).map((row) => row.id)).toEqual(["ca-null"]);
  });

  it("keeps Long Beach, MS isolated when the selected MS location has coords", () => {
    const selected = {
      city: "Long Beach",
      region: "Mississippi",
      lat: 30.3500,
      lng: -89.1500,
    };
    const rows = [
      { id: "ca-null", city: "Long Beach", state: "CA", latitude: null, longitude: null },
      { id: "ms-null", city: "Long Beach", state: "MS", latitude: null, longitude: null },
    ];

    expect(filterByLocation(rows, selected).map((row) => row.id)).toEqual(["ms-null"]);
  });
});
