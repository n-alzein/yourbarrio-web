export const ADMIN_ROLE_LABELS: Record<string, string> = {
  admin_super: "Super Admin",
  admin_support: "Support Admin",
  admin_readonly: "Read-only Admin",
  admin_ops: "Ops Admin",
};

export function formatAdminRoleLabel(roleKey: string): string {
  return ADMIN_ROLE_LABELS[roleKey] || roleKey;
}
