import { descriptionToEditableHtml } from "@/lib/listingDescription";
import { sanitizeListingHtml } from "@/lib/sanitizeHtml";

export default function ListingDescription({
  htmlOrText,
  className = "",
  fallback = "A local item from YourBarrio businesses.",
}) {
  const source = String(htmlOrText || "").trim();
  // Backward compatibility: older listings stored plain text.
  const normalized = descriptionToEditableHtml(source || fallback);
  const safeHtml = sanitizeListingHtml(normalized);

  return (
    <div
      className={`listing-prose text-sm leading-relaxed opacity-90 ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
