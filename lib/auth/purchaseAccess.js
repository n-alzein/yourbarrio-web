const RESTRICTED_PURCHASE_ROLES = new Set(["business"]);

export function isPurchaseRestrictedRole({ role = null, isInternal = false } = {}) {
  // Purchase eligibility is role-based only. Do not infer "business" access
  // from internal flags, businesses rows, onboarding state, or route surface.
  if (typeof role !== "string") return false;
  return RESTRICTED_PURCHASE_ROLES.has(role.trim().toLowerCase());
}

export function getPurchaseRestrictionMessage() {
  return "Customer accounts only.";
}

export function getPurchaseRestrictionHelpText() {
  return "Business accounts cannot place customer orders.";
}
