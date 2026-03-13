import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function read(relPath: string) {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

describe("delete account modal readability styles", () => {
  it("customer settings modal uses opaque/high-contrast surface", () => {
    const src = read("app/(customer)/customer/settings/page.js");
    expect(src).toContain("bg-slate-950/85");
    expect(src).toContain("bg-slate-950 p-6");
    expect(src).toContain("border-slate-700");
    expect(src).toContain("focus-visible:ring-2");
  });

  it("business settings modal uses opaque/high-contrast surface", () => {
    const src = read("app/(business)/business/settings/page.js");
    expect(src).toContain("bg-slate-950/85");
    expect(src).toContain("bg-slate-950 p-6");
    expect(src).toContain("border-slate-700");
    expect(src).toContain("focus-visible:ring-2");
  });
});
