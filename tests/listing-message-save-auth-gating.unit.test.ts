import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const listingPageSource = readFileSync(
  path.join(process.cwd(), "app/(public)/listings/[id]/page.js"),
  "utf8"
);

describe("public listing message/save auth gating", () => {
  it("opens the existing login modal instead of redirecting to the homepage", () => {
    expect(listingPageSource).toContain('openModal("customer-login", { next: currentPath })');
    expect(listingPageSource).toContain("setAuthIntent({ redirectTo: currentPath, role: \"customer\" })");
    expect(listingPageSource).not.toContain("router.push(loginHref)");
    expect(listingPageSource).not.toContain("modal=customer-login&next=");
  });

  it("stores message and save intent context for post-login continuity", () => {
    expect(listingPageSource).toContain('type: "save_item"');
    expect(listingPageSource).toContain('type: "message_business"');
    expect(listingPageSource).toContain("listingId: listing.id");
    expect(listingPageSource).toContain("businessId");
    expect(listingPageSource).toContain("PENDING_AUTH_ACTION_STORAGE_KEY");
  });
});
