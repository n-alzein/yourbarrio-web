import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
];

const ALLOWED_ATTR = ["href", "target", "rel"];

function forceExternalLinkSafety(html) {
  return (html || "").replace(/<a\s+([^>]*?)>/gi, (fullMatch, attrs = "") => {
    const hrefMatch = attrs.match(/href\s*=\s*(['"])(.*?)\1/i);
    const hrefValue = (hrefMatch?.[2] || "").trim().toLowerCase();
    const isExternal = hrefValue.startsWith("http://") || hrefValue.startsWith("https://");

    if (!isExternal) {
      return `<a ${attrs}>`;
    }

    let nextAttrs = attrs;

    if (/target\s*=\s*(['"]).*?\1/i.test(nextAttrs)) {
      nextAttrs = nextAttrs.replace(/target\s*=\s*(['"]).*?\1/gi, 'target="_blank"');
    } else {
      nextAttrs = `${nextAttrs} target="_blank"`.trim();
    }

    if (/rel\s*=\s*(['"]).*?\1/i.test(nextAttrs)) {
      nextAttrs = nextAttrs.replace(
        /rel\s*=\s*(['"]).*?\1/gi,
        'rel="noopener noreferrer"'
      );
    } else {
      nextAttrs = `${nextAttrs} rel="noopener noreferrer"`.trim();
    }

    return `<a ${nextAttrs}>`;
  });
}

export function sanitizeListingHtml(html) {
  const safeHtml = DOMPurify.sanitize(html || "", {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script", "style"],
  });

  return forceExternalLinkSafety(safeHtml);
}
