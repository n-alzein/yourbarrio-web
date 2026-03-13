import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function read(relPath: string) {
  const abs = path.join(process.cwd(), relPath);
  return fs.readFileSync(abs, "utf8");
}

describe("account deletion user-facing copy", () => {
  it("customer settings deletion copy is permanent and non-recoverable", () => {
    const src = read("app/(customer)/customer/settings/page.js").toLowerCase();
    expect(src).toContain("delete account permanently?");
    expect(src).toContain("this action is permanent and cannot be undone");
    expect(src).not.toContain("30 days");
    expect(src).not.toContain("super admin");
    expect(src).not.toContain("restore");
    expect(src).not.toContain("pending deletion");
    expect(src).not.toContain("account-pending-deletion");
  });

  it("business settings deletion copy is permanent and non-recoverable", () => {
    const src = read("app/(business)/business/settings/page.js").toLowerCase();
    expect(src).toContain("delete account permanently?");
    expect(src).toContain("this action is permanent and cannot be undone");
    expect(src).not.toContain("30 days");
    expect(src).not.toContain("super admin");
    expect(src).not.toContain("restore");
    expect(src).not.toContain("pending deletion");
    expect(src).not.toContain("account-pending-deletion");
  });

  it("deleted account screen is neutral", () => {
    const src = read("app/account-deleted/page.tsx").toLowerCase();
    expect(src).toContain("account deleted");
    expect(src).toContain("your account has been deleted");
    expect(src).not.toContain("pending");
    expect(src).not.toContain("restore");
    expect(src).not.toContain("30 days");
  });
});
