import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("settings phone separation", () => {
  it("business settings saves the private phone through the account profile API", () => {
    const source = read("app/(business)/business/settings/page.js");

    expect(source).toContain('label="Your phone number"');
    expect(source).toContain(
      "Private account contact number. This is not shown on your business profile."
    );
    expect(source).toContain('fetch("/api/account/profile"');
    expect(source).toContain('fetch("/api/business/profile"');
    expect(source).not.toContain("business_name: form.full_name,\n      phone: form.phone");
  });

  it("customer settings saves the private phone through the account profile API", () => {
    const source = read("app/(customer)/customer/settings/page.js");

    expect(source).toContain('label="Your phone number"');
    expect(source).toContain(
      "Private account contact number. This is not shown on your business profile."
    );
    expect(source).toContain('fetch("/api/account/profile"');
    expect(source).not.toContain('.from("users")\n      .update');
  });
});
