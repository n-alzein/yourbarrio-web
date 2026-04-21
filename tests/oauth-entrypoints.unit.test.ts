import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SEARCH_ROOTS = ["app", "components"];

function walkFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(fullPath);
    return /\.(jsx?|tsx?)$/.test(entry.name) ? [fullPath] : [];
  });
}

describe("Google OAuth entry points", () => {
  it("use the shared callback URL builder", () => {
    const googleOauthFiles = SEARCH_ROOTS.flatMap(walkFiles).filter((file) => {
      const src = fs.readFileSync(file, "utf8");
      return src.includes("signInWithOAuth") && src.includes('provider: "google"');
    });

    expect(googleOauthFiles.length).toBeGreaterThan(0);
    googleOauthFiles.forEach((file) => {
      const src = fs.readFileSync(file, "utf8");
      expect(src, file).toContain("buildOAuthCallbackUrl");
      expect(src, file).not.toContain('new URL("/api/auth/callback"');
      expect(src, file).not.toContain("`${origin}/api/auth/callback");
    });
  });
});
