import { describe, expect, it } from "vitest";
import { getPickupAvailabilityLabel } from "@/lib/pickupAvailability";

describe("getPickupAvailabilityLabel", () => {
  const timeZone = "UTC";

  it("returns available today while the store is open", () => {
    const label = getPickupAvailabilityLabel({
      pickupAvailable: true,
      timeZone,
      now: new Date("2026-04-24T12:00:00Z"),
      hours: {
        fri: { open: "09:00", close: "18:00", isClosed: false },
      },
    });

    expect(label).toBe("Pickup today until 6 PM");
  });

  it("returns available tomorrow when closed now and the next opening is tomorrow", () => {
    const label = getPickupAvailabilityLabel({
      pickupAvailable: true,
      timeZone,
      now: new Date("2026-04-24T20:00:00Z"),
      hours: {
        fri: { open: "09:00", close: "18:00", isClosed: false },
        sat: { open: "10:00", close: "16:00", isClosed: false },
      },
    });

    expect(label).toBe("Pickup tomorrow");
  });

  it("returns the next weekday when the next opening is later than tomorrow", () => {
    const label = getPickupAvailabilityLabel({
      pickupAvailable: true,
      timeZone,
      now: new Date("2026-04-24T20:00:00Z"),
      hours: {
        mon: { open: "10:00", close: "16:00", isClosed: false },
        fri: { open: "09:00", close: "18:00", isClosed: false },
        sat: { isClosed: true },
        sun: { isClosed: true },
      },
    });

    expect(label).toBe("Pickup Monday");
  });

  it("falls back to shop-confirmed copy when hours are missing", () => {
    const label = getPickupAvailabilityLabel({
      pickupAvailable: true,
      timeZone,
      now: new Date("2026-04-24T12:00:00Z"),
      hours: {},
    });

    expect(label).toBe("Pickup availability confirmed by shop");
  });

  it("returns unavailable when pickup is disabled", () => {
    const label = getPickupAvailabilityLabel({
      pickupAvailable: false,
      timeZone,
      now: new Date("2026-04-24T12:00:00Z"),
      hours: {
        fri: { open: "09:00", close: "18:00", isClosed: false },
      },
    });

    expect(label).toBe("Pickup currently unavailable");
  });

  it("supports overnight hours after midnight", () => {
    const label = getPickupAvailabilityLabel({
      pickupAvailable: true,
      timeZone,
      now: new Date("2026-04-25T01:00:00Z"),
      hours: {
        fri: { open: "18:00", close: "02:00", isClosed: false },
      },
    });

    expect(label).toBe("Pickup today until 2 AM");
  });

  it("falls back when hours are malformed", () => {
    const label = getPickupAvailabilityLabel({
      pickupAvailable: true,
      timeZone,
      now: new Date("2026-04-24T12:00:00Z"),
      hours: {
        fri: { open: "bad", close: "18:00", isClosed: false },
      },
    });

    expect(label).toBe("Pickup availability confirmed by shop");
  });
});
