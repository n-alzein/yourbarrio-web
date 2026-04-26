import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.join(process.cwd(), "app/(business)/business/listings/page.js"),
  "utf8"
);

describe("business listings page card hierarchy", () => {
  it("uses a single status badge with out-of-stock precedence", () => {
    expect(source).toContain('const hasUnpublishedChanges = listing.has_unpublished_changes === true;');
    expect(source).toContain('"Changes not published"');
    expect(source).toContain('backgroundColor: "#ffffff"');
    expect(source).toContain('color: "#111827"');
    expect(source).toContain('border: "1px solid #e5e7eb"');
    expect(source).toContain('boxShadow: "0 2px 6px rgba(0,0,0,0.08)"');
    expect(source).toContain("bg-slate-950/10");
    expect(source).not.toContain("{inventory.label}");
  });

  it("keeps publish and unpublish actions with subtler delete treatment", () => {
    expect(source).toContain('handleStatusChange(listing.id, "published")');
    expect(source).toContain('handleStatusChange(listing.id, "draft")');
    expect(source).toContain("Publish");
    expect(source).toContain("Unpublish");
    expect(source).toContain("text-slate-500 hover:text-slate-900");
  });

  it("makes the card the edit entry point and removes card-level inventory controls", () => {
    expect(source).toContain('role="link"');
    expect(source).toContain('router.push(editHref)');
    expect(source).toContain("Edit listing");
    expect(source).not.toContain("Inventory actions");
    expect(source).not.toContain("Restock");
    expect(source).not.toContain("Mark out of stock");
    expect(source).not.toContain("Pause listing");
  });

  it("uses the cleaner stock copy", () => {
    expect(source).toContain("in stock");
    expect(source).toContain('<span className="font-semibold">Out of stock</span>');
    expect(source).not.toContain("<span>Stock:</span>");
  });

  it("labels seller pricing and shows customer-facing pricing only when fee-inclusive pricing exists", () => {
    expect(source).toContain("Seller price");
    expect(source).toContain("Customer-facing price:");
    expect(source).toContain("incl. marketplace fee");
    expect(source).toContain("pricing.finalPriceCents > pricing.basePriceCents");
    expect(source).not.toContain('>Price TBD<');
  });
});
