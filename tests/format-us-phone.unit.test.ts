import { describe, expect, it } from "vitest";

import {
  formatUSPhone,
  getUSPhoneDigits,
  isIncompleteUSPhone,
  normalizeUSPhoneForStorage,
} from "@/lib/utils/formatUSPhone";

describe("formatUSPhone", () => {
  it("formats digits into a US phone number", () => {
    expect(formatUSPhone("5551234567")).toBe("(555) 123-4567");
  });

  it("strips non-digits and caps the result at 10 digits", () => {
    expect(formatUSPhone("+1 (555) 123-4567")).toBe("(555) 123-4567");
    expect(formatUSPhone("5551234567899")).toBe("(555) 123-4567");
  });

  it("preserves partial input while typing", () => {
    expect(formatUSPhone("562")).toBe("(562");
    expect(formatUSPhone("5621")).toBe("(562) 1");
    expect(formatUSPhone("562123")).toBe("(562) 123");
    expect(formatUSPhone("5621234567")).toBe("(562) 123-4567");
    expect(formatUSPhone("5")).toBe("(5");
    expect(formatUSPhone("5551")).toBe("(555) 1");
    expect(formatUSPhone("5551234")).toBe("(555) 123-4");
  });

  it("normalizes pasted common US phone formats", () => {
    expect(formatUSPhone("5621234567")).toBe("(562) 123-4567");
    expect(formatUSPhone("562-123-4567")).toBe("(562) 123-4567");
    expect(formatUSPhone("+1 562 123 4567")).toBe("(562) 123-4567");
    expect(formatUSPhone("(562) 123-4567")).toBe("(562) 123-4567");
  });

  it("exposes normalized digits and storage formatting", () => {
    expect(getUSPhoneDigits("+1 562 123 4567")).toBe("5621234567");
    expect(normalizeUSPhoneForStorage("562-123-4567")).toBe("(562) 123-4567");
    expect(normalizeUSPhoneForStorage("562")).toBe("");
  });

  it("detects only incomplete non-empty values", () => {
    expect(isIncompleteUSPhone("")).toBe(false);
    expect(isIncompleteUSPhone("562")).toBe(true);
    expect(isIncompleteUSPhone("(562) 123-4567")).toBe(false);
  });
});
