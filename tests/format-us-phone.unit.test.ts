import { describe, expect, it } from "vitest";

import { formatUSPhone } from "@/lib/utils/formatUSPhone";

describe("formatUSPhone", () => {
  it("formats digits into a US phone number", () => {
    expect(formatUSPhone("5551234567")).toBe("(555) 123-4567");
  });

  it("strips non-digits and caps the result at 10 digits", () => {
    expect(formatUSPhone("+1 (555) 123-4567")).toBe("(555) 123-4567");
    expect(formatUSPhone("5551234567899")).toBe("(555) 123-4567");
  });

  it("preserves partial input while typing", () => {
    expect(formatUSPhone("5")).toBe("(5");
    expect(formatUSPhone("5551")).toBe("(555) 1");
    expect(formatUSPhone("5551234")).toBe("(555) 123-4");
  });
});
