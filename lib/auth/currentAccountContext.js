const PUBLIC_USER_ROLES = new Set(["admin", "business", "customer"]);

export function normalizePublicUserRole(value) {
  if (typeof value !== "string") return null;
  const role = value.trim().toLowerCase();
  return PUBLIC_USER_ROLES.has(role) ? role : null;
}

export function buildCurrentAccountContext({
  user = null,
  profile = null,
  businessRowExists = false,
} = {}) {
  const role = normalizePublicUserRole(profile?.role);
  const isAuthenticated = Boolean(user?.id);
  const isRoleResolved = isAuthenticated ? Boolean(role) : true;
  const isBusiness = role === "business";
  const isAdmin = role === "admin";
  const canPurchase = role === "customer";

  return {
    user: user ?? null,
    profile: profile ?? null,
    role,
    isAuthenticated,
    isRoleResolved,
    businessRowExists: Boolean(businessRowExists),
    isBusiness,
    isAdmin,
    canPurchase,
  };
}

export function logCurrentAccountContext({
  source = "unknown",
  host = null,
  context,
}) {
  if (!context?.isAuthenticated) return;

  console.info("[ACCOUNT_CONTEXT_DEBUG]", {
    source,
    host: host || null,
    authUserId: context.user?.id || null,
    authEmail: context.user?.email || null,
    usersRole: context.role || null,
    businessRowExists: context.businessRowExists === true,
    canPurchase: context.canPurchase === true,
    isBusiness: context.isBusiness === true,
  });
}
