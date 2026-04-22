import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getSiteUrlFromHeaders } from "@/lib/auth/getSiteUrl";

function headersFor(host: string) {
  return new Headers({
    host,
    "x-forwarded-host": host,
    "x-forwarded-proto": "https",
  });
}

describe("site URL canonical origin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes configured www YourBarrio site URLs to apex", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.yourbarrio.com");

    expect(getSiteUrlFromHeaders(headersFor("yourbarrio.com"))).toBe(
      "https://yourbarrio.com"
    );
  });

  it("normalizes www request hosts to apex when no env override is present", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("SITE_URL", "");

    expect(getSiteUrlFromHeaders(headersFor("www.yourbarrio.com"))).toBe(
      "https://yourbarrio.com"
    );
  });

  it("keeps preview request hosts on their own origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("SITE_URL", "");

    expect(getSiteUrlFromHeaders(headersFor("yourbarrio-git-auth-fix.vercel.app"))).toBe(
      "https://yourbarrio-git-auth-fix.vercel.app"
    );
  });
});
