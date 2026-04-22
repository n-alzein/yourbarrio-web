import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOAuthCallbackUrl,
  getOAuthConfigDiagnostics,
  getOAuthRedirectOrigin,
} from "@/lib/auth/oauthRedirect";

describe("OAuth callback URL generation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps localhost on localhost", () => {
    expect(
      buildOAuthCallbackUrl({
        currentOrigin: "http://localhost:3000",
        next: "/customer/home",
      })
    ).toBe("http://localhost:3000/api/auth/callback?next=%2Fcustomer%2Fhome");
  });

  it("keeps Vercel preview domains on the preview origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://yourbarrio.com");

    expect(
      buildOAuthCallbackUrl({
        currentOrigin: "https://yourbarrio-git-auth-fix.vercel.app",
        next: "/customer/home",
      })
    ).toBe(
      "https://yourbarrio-git-auth-fix.vercel.app/api/auth/callback?next=%2Fcustomer%2Fhome"
    );
  });

  it("keeps apex YourBarrio on the canonical apex origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("SITE_URL", "");

    expect(getOAuthRedirectOrigin("https://yourbarrio.com")).toBe("https://yourbarrio.com");
  });

  it("canonicalizes www YourBarrio to the apex origin", () => {
    expect(getOAuthRedirectOrigin("https://www.yourbarrio.com")).toBe("https://yourbarrio.com");
  });

  it("honors NEXT_PUBLIC_SITE_URL for YourBarrio production hosts", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.yourbarrio.com");

    expect(getOAuthRedirectOrigin("https://yourbarrio.com")).toBe("https://yourbarrio.com");
  });

  it("falls back to SITE_URL when public site URL is absent", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("SITE_URL", "https://www.yourbarrio.com");

    expect(getOAuthRedirectOrigin("https://yourbarrio.com")).toBe("https://yourbarrio.com");
  });

  it("reports safe diagnostics without exposing secret values", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.yourbarrio.com");

    expect(
      getOAuthConfigDiagnostics({ currentOrigin: "https://yourbarrio.com" })
    ).toEqual({
      hasSupabaseUrl: true,
      hasSupabaseAnonKey: true,
      configuredSiteUrl: "https://yourbarrio.com",
      detectedOrigin: "https://yourbarrio.com",
      redirectOrigin: "https://yourbarrio.com",
      callbackUrl: "https://yourbarrio.com/api/auth/callback",
    });
  });
});
