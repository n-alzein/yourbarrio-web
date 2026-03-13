import { describe, expect, it } from "vitest";
import {
  shouldSuppressAuthUiReset,
  suppressAuthUiResetForCredentialsError,
} from "@/lib/auth/loginErrors";

describe("auth UI reset suppression", () => {
  it("temporarily suppresses auth UI resets for credential-style errors", () => {
    expect(shouldSuppressAuthUiReset()).toBe(false);
    suppressAuthUiResetForCredentialsError(1000);
    expect(shouldSuppressAuthUiReset()).toBe(true);
  });
});
