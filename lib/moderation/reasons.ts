export type ModerationTargetType = "listing" | "review" | "user" | "business";

export const MODERATION_REASONS: Record<ModerationTargetType, string[]> = {
  listing: [
    "scam_or_fraud",
    "prohibited_item",
    "misleading_or_inaccurate",
    "spam",
    "other",
  ],
  review: [
    "spam",
    "offensive_or_hate",
    "harassment",
    "fake_or_manipulated",
    "other",
  ],
  user: ["harassment", "scam_or_fraud", "impersonation", "spam", "other"],
  business: ["harassment", "scam_or_fraud", "impersonation", "spam", "other"],
};

export const MODERATION_REASON_LABELS: Record<string, string> = {
  scam_or_fraud: "Scam or fraud",
  prohibited_item: "Prohibited item",
  misleading_or_inaccurate: "Misleading or inaccurate",
  spam: "Spam",
  offensive_or_hate: "Offensive or hateful",
  harassment: "Harassment",
  fake_or_manipulated: "Fake or manipulated",
  impersonation: "Impersonation",
  other: "Other",
};

export function getReasonLabel(reasonCode?: string | null) {
  const key = String(reasonCode || "").trim().toLowerCase();
  if (!key) return "Unknown";
  return MODERATION_REASON_LABELS[key] || key.replace(/_/g, " ");
}

export function getTargetLabel(targetType?: string | null) {
  const key = String(targetType || "").trim().toLowerCase();
  if (key === "listing") return "Listing";
  if (key === "review") return "Review";
  if (key === "user") return "User";
  if (key === "business") return "Business";
  return "Target";
}
