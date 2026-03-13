import { describe, expect, it } from "vitest";
import {
  BLOCKED_LOGIN_ERROR_CODE,
  createBlockedLoginError,
  GENERIC_INVALID_CREDENTIALS_MESSAGE,
  isGenericInvalidCredentialsError,
} from "@/lib/auth/loginErrors";

describe("login error masking", () => {
  it("maps wrong-password style errors to generic invalid credentials", () => {
    const wrongPassword = { message: "Invalid login credentials" };
    const nonExistent = { code: "invalid_credentials", message: "invalid credentials" };

    expect(isGenericInvalidCredentialsError(wrongPassword)).toBe(true);
    expect(isGenericInvalidCredentialsError(nonExistent)).toBe(true);
    expect(GENERIC_INVALID_CREDENTIALS_MESSAGE).toBe("The email or password is incorrect.");
  });

  it("maps blocked-account marker to generic invalid credentials", () => {
    const blocked = createBlockedLoginError();
    expect(String(blocked.code)).toBe(BLOCKED_LOGIN_ERROR_CODE);
    expect(isGenericInvalidCredentialsError(blocked)).toBe(true);
  });
});
