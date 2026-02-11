import Link from "next/link";
import { adminLogoutAction } from "@/app/admin/actions";
import { canAdmin, getHighestAdminRole, type AdminRole } from "@/lib/admin/permissions";

type AdminNavProps = {
  roles: AdminRole[];
  strictPermissionBypassUsed?: boolean;
};

export default function AdminNav({ roles, strictPermissionBypassUsed = false }: AdminNavProps) {
  const canModerate = strictPermissionBypassUsed || canAdmin(roles, "moderation");
  const canImpersonate = strictPermissionBypassUsed || canAdmin(roles, "impersonate");
  const canManageAdmins = strictPermissionBypassUsed || canAdmin(roles, "manage_admins");
  const currentRole = getHighestAdminRole(roles) || "admin_readonly";

  const navItems = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/accounts", label: "Accounts" },
    { href: "/admin/customers", label: "Customers" },
    { href: "/admin/businesses", label: "Businesses" },
    { href: "/admin/admins", label: canManageAdmins ? "Admin Management" : "Admins" },
    ...(canModerate ? [{ href: "/admin/moderation", label: "Moderation" }] : []),
    { href: "/admin/audit", label: "Audit" },
    ...(canImpersonate ? [{ href: "/admin/impersonation", label: "Support Mode" }] : []),
    { href: "/admin/profile", label: "Profile" },
  ];

  return (
    <nav className="grid gap-2">
      <div className="rounded-md border border-indigo-800/70 bg-indigo-950/60 px-3 py-2 text-xs uppercase tracking-wide text-indigo-100">
        Admin role: {currentRole}
      </div>
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-neutral-600"
        >
          {item.label}
        </Link>
      ))}
      <form action={adminLogoutAction}>
        <button
          type="submit"
          className="w-full rounded-md border border-red-900 bg-red-950 px-3 py-2 text-left text-sm text-red-100 hover:border-red-700"
        >
          Log out
        </button>
      </form>
    </nav>
  );
}
