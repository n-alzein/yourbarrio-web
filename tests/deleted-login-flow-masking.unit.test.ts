import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function read(relPath: string) {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

describe("deleted account login flow masking", () => {
  it("auth callback routes blocked account login attempts to generic invalid credentials", () => {
    const src = read("app/api/auth/callback/route.js");
    expect(src).toContain('authError: "invalid_credentials"');
    expect(src).not.toContain("destination: getAccountDeletedRedirectPath()");
  });

  it("business auth callbacks gate onboarding behind password setup", () => {
    const callbackSrc = read("app/api/auth/callback/route.js");
    const confirmSrc = read("app/auth/confirm/route.ts");

    expect(callbackSrc).toContain("getBusinessRedirectDestination");
    expect(callbackSrc).toContain("getBusinessPasswordGateState");
    expect(confirmSrc).toContain("getBusinessRedirectDestination");
    expect(confirmSrc).toContain("getBusinessPasswordGateState");
  });

  it("auth confirm supports both code exchange and signup token-hash verification", () => {
    const confirmSrc = read("app/auth/confirm/route.ts");

    expect(confirmSrc).toContain('"signup"');
    expect(confirmSrc).toContain('"magiclink"');
    expect(confirmSrc).toContain("exchangeCodeForSession(code)");
    expect(confirmSrc).toContain("verifyOtp({");
  });

  it("business login page consumes auth query param for callback errors", () => {
    const src = read("app/(auth)/business-auth/login/page.js");
    expect(src).toContain("resolvedSearchParams?.auth");
  });

  it("customer and business login UIs use the same generic invalid-credentials message", () => {
    const customerSrc = read("components/modals/CustomerLoginModal.jsx");
    const businessSrc = read("components/business-auth/BusinessLoginClient.jsx");

    expect(customerSrc).toContain("GENERIC_INVALID_CREDENTIALS_MESSAGE");
    expect(businessSrc).toContain("GENERIC_INVALID_CREDENTIALS_MESSAGE");
  });
});
