import { describe, expect, it } from "vitest";
import {
  descriptionSnippet,
  descriptionToEditableHtml,
  plainTextToHtml,
} from "@/lib/listingDescription";
import { sanitizeListingHtml } from "@/lib/sanitizeHtml";

describe("listing description HTML support", () => {
  it("converts plain text to paragraph HTML for backward compatibility", () => {
    const html = plainTextToHtml("Line one\nLine two\n\nLine three");
    expect(html).toContain("<p>Line one<br />Line two</p>");
    expect(html).toContain("<p>Line three</p>");
  });

  it("keeps existing HTML content unchanged before sanitize", () => {
    const html = descriptionToEditableHtml("<p><strong>Fresh</strong> coffee</p>");
    expect(html).toBe("<p><strong>Fresh</strong> coffee</p>");
  });

  it("removes scripts and inline event handlers", () => {
    const dirty =
      '<p>Hello</p><img src=x onerror=alert(1) /><script>alert(1)</script>';
    const clean = sanitizeListingHtml(dirty);
    expect(clean).toContain("<p>Hello</p>");
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("<img");
  });

  it("forces external links to open safely", () => {
    const clean = sanitizeListingHtml('<a href="https://example.com">Visit</a>');
    expect(clean).toContain('target="_blank"');
    expect(clean).toContain('rel="noopener noreferrer"');
  });

  it("creates plain text snippets from rich HTML", () => {
    const snippet = descriptionSnippet(
      "<p><strong>Great</strong> beans</p><ul><li>Single origin</li><li>Roasted weekly</li></ul>",
      120
    );
    expect(snippet).toContain("Great beans");
    expect(snippet).toContain("Single origin");
    expect(snippet).not.toContain("<");
  });
});
