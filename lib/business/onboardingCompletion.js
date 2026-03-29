import { getBusinessTypeLabel } from "@/lib/taxonomy/compat";

export function isBusinessOnboardingComplete(businessRow) {
  if (!businessRow || typeof businessRow !== "object") return false;

  const requiredFields = [
    businessRow.business_name,
    getBusinessTypeLabel(businessRow, ""),
    businessRow.address,
    businessRow.city,
    businessRow.state,
    businessRow.postal_code,
  ];

  return requiredFields.every((value) => String(value || "").trim().length > 0);
}
