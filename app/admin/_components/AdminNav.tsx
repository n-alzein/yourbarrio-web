import Link from "next/link";
import AdminLogoutButton from "@/app/admin/_components/AdminLogoutButton";
import { ADMIN_ROLES, canAdmin, getHighestAdminRole, type AdminRole } from "@/lib/admin/permissions";
import { formatAdminRoleLabel } from "@/lib/admin/roleLabels";

type AdminNavProps = {
  roles: string[];
  strictPermissionBypassUsed?: boolean;
  variant?: "vertical" | "horizontal";
  collapsed?: boolean;
  pendingVerificationCount?: number;
};

export default function AdminNav({
  roles,
  strictPermissionBypassUsed = false,
  variant = "vertical",
  collapsed = false,
  pendingVerificationCount = 0,
}: AdminNavProps) {
  const normalizedRoles = roles.filter((role): role is AdminRole =>
    (ADMIN_ROLES as readonly string[]).includes(role)
  );
  const canModerate = strictPermissionBypassUsed || canAdmin(normalizedRoles, "moderation");
  const canImpersonate = strictPermissionBypassUsed || canAdmin(normalizedRoles, "impersonate");
  const canManageAdmins = strictPermissionBypassUsed || canAdmin(normalizedRoles, "manage_admins");
  const currentRole = getHighestAdminRole(normalizedRoles) || "admin_readonly";
  const isHorizontal = variant === "horizontal";

  const navItems: Array<{ href: string; label: string; icon: NavIconName; badgeCount?: number }> = [
    { href: "/admin", label: "Dashboard", icon: "dashboard" },
    { href: "/admin/accounts", label: "Accounts", icon: "accounts" },
    { href: "/admin/customers", label: "Customers", icon: "customers" },
    { href: "/admin/businesses", label: "Businesses", icon: "businesses" },
    { href: "/admin/listings", label: "Listings", icon: "listings" },
    { href: "/admin/verification", label: "Verification", icon: "verification", badgeCount: pendingVerificationCount },
    { href: "/admin/admins", label: canManageAdmins ? "Admin Management" : "Admins", icon: "admins" },
    ...(canManageAdmins
      ? [{ href: "/admin/settings/features", label: "Settings", icon: "settings" as const }]
      : []),
    ...(canModerate ? [{ href: "/admin/moderation", label: "Moderation", icon: "moderation" as const }] : []),
    { href: "/admin/audit", label: "Audit", icon: "audit" },
    ...(canImpersonate
      ? [{ href: "/admin/impersonation", label: "Support Mode", icon: "impersonation" as const }]
      : []),
    { href: "/admin/profile", label: "Profile", icon: "profile" },
  ];

  return (
    <nav className={isHorizontal ? "overflow-x-auto whitespace-nowrap" : "grid gap-2"}>
      {!isHorizontal && !collapsed ? (
        <div className="rounded-md border border-indigo-800/70 bg-indigo-950/60 px-3 py-2 text-xs uppercase tracking-wide text-indigo-100">
          Admin role: {formatAdminRoleLabel(currentRole)}
        </div>
      ) : null}
      <div className={isHorizontal ? "flex items-center gap-2 pb-1" : "grid gap-2"}>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed && !isHorizontal ? item.label : undefined}
            aria-label={collapsed && !isHorizontal ? item.label : undefined}
            className={
              isHorizontal
                ? "inline-flex rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100 hover:border-neutral-500"
                : collapsed
                  ? "inline-flex h-11 w-11 items-center justify-center rounded-md border border-neutral-800 bg-neutral-900 text-neutral-100 hover:border-neutral-600"
                  : "inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-neutral-600"
            }
          >
            <NavIcon name={item.icon} />
            {!collapsed || isHorizontal ? (
              <span className="flex min-w-0 items-center gap-2">
                <span>{item.label}</span>
                {typeof item.badgeCount === "number" ? (
                  <span
                    className={`inline-flex min-w-[2rem] items-center justify-center rounded-full border px-1.5 py-0.5 text-[11px] font-semibold ${
                      item.badgeCount > 0
                        ? "border-red-700/70 bg-red-950/80 text-red-100"
                        : "border-transparent text-transparent"
                    }`}
                    aria-label={item.badgeCount > 0 ? `${item.badgeCount} pending verifications` : undefined}
                  >
                    {item.badgeCount > 99 ? "99+" : item.badgeCount > 0 ? item.badgeCount : 0}
                  </span>
                ) : null}
              </span>
            ) : null}
          </Link>
        ))}
        <AdminLogoutButton
          title={collapsed && !isHorizontal ? "Log out" : undefined}
          ariaLabel={collapsed && !isHorizontal ? "Log out" : undefined}
          className={
            isHorizontal
              ? "inline-flex rounded-full border border-red-900 bg-red-950 px-3 py-1.5 text-sm text-red-100 hover:border-red-700"
              : collapsed
                ? "inline-flex h-11 w-11 items-center justify-center rounded-md border border-red-900 bg-red-950 text-red-100 hover:border-red-700"
                : "inline-flex w-full items-center gap-2 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-left text-sm text-red-100 hover:border-red-700"
          }
        >
          <NavIcon name="logout" />
          {!collapsed || isHorizontal ? <span>Log out</span> : null}
        </AdminLogoutButton>
      </div>
    </nav>
  );
}

type NavIconName =
  | "dashboard"
  | "accounts"
  | "customers"
  | "businesses"
  | "listings"
  | "verification"
  | "admins"
  | "settings"
  | "moderation"
  | "audit"
  | "impersonation"
  | "profile"
  | "logout";

function NavIcon({ name }: { name: NavIconName }) {
  const className = "h-4 w-4 shrink-0";
  switch (name) {
    case "dashboard":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 13h8V3H3zM13 21h8V11h-8zM13 3h8v6h-8zM3 17h8v4H3z" />
        </svg>
      );
    case "accounts":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A3.5 3.5 0 0 1 7.5 16h9A3.5 3.5 0 0 1 20 19.5" />
          <circle cx="12" cy="9" r="3.5" />
        </svg>
      );
    case "customers":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="3" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a3 3 0 0 1 0 5.74" />
        </svg>
      );
    case "businesses":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 21h18" />
          <path d="M5 21V7l7-4 7 4v14" />
          <path d="M9 10h6M9 14h6" />
        </svg>
      );
    case "listings":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6.5 12 3l8 3.5v11L12 21l-8-3.5z" />
          <path d="M12 3v18" />
          <path d="m4 6.5 8 3.5 8-3.5" />
        </svg>
      );
    case "verification":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2 4 6v6c0 5.3 3.4 9 8 10 4.6-1 8-4.7 8-10V6z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "admins":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7z" />
          <path d="M9.5 12.5 11 14l3.5-3.5" />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.1a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.1a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.1a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.1a1 1 0 0 0-.9.6z" />
        </svg>
      );
    case "moderation":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2 3 6v6c0 5 3.8 9.7 9 10 5.2-.3 9-5 9-10V6z" />
          <path d="M9 12h6" />
        </svg>
      );
    case "audit":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 17H4V4h13v5" />
          <path d="M13 12h7v7h-7z" />
          <path d="M7 8h6M7 12h3" />
        </svg>
      );
    case "impersonation":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
          <path d="M2 21v-2a6 6 0 0 1 6-6h2" />
          <path d="m16 21 5-5-5-5" />
          <path d="M10 16h11" />
        </svg>
      );
    case "profile":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      );
    case "logout":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="m16 17 5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      );
    default:
      return null;
  }
}
