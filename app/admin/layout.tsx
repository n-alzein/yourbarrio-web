import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import AdminShellClient from "@/app/admin/_components/AdminShellClient";
import AdminSidebar from "@/app/admin/_components/AdminSidebar";
import AdminStatusStack from "@/app/admin/_components/AdminStatusStack";
import { getEffectiveUserId } from "@/lib/admin/impersonation";
import { getHighestAdminRole, isAdminDevAllowlistConfigured, requireAdmin } from "@/lib/admin/permissions";
import { getCurrentUserRole } from "@/lib/auth/getCurrentUserRole";
import { getRequestPath } from "@/lib/url/getRequestPath";
import { isAdminBypassRlsEnabled } from "@/lib/supabase/admin";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { role } = await getCurrentUserRole();
  // Deny by default and hide admin surface existence from non-admin users.
  if (role !== "admin") notFound();

  const guardDiagEnabled =
    String(process.env.AUTH_GUARD_DIAG || "") === "1" ||
    String(process.env.NEXT_PUBLIC_AUTH_DIAG || "") === "1";
  const requestPath = await getRequestPath("/admin");
  const signInRedirect = `/signin?modal=signin&next=${encodeURIComponent(requestPath)}`;
  if (guardDiagEnabled) {
    console.warn("[AUTH_GUARD_DIAG] admin_layout:entry", {
      requestPath,
      signInRedirect,
    });
  }
  const admin = await requireAdmin({
    unauthenticatedRedirectTo: signInRedirect,
    unauthorizedRedirectTo: "/not-authorized",
  });
  if (guardDiagEnabled) {
    console.warn("[AUTH_GUARD_DIAG] admin_layout:authorized", {
      userId: admin.user.id,
      email: admin.user.email || null,
      profileRole: admin.profile?.role || null,
      isInternal: admin.profile?.is_internal === true,
      roles: admin.roles,
      devAllowlistUsed: admin.devAllowlistUsed,
    });
  }
  const { activeImpersonation } = await getEffectiveUserId();
  const showAllowlistBanner = admin.devAllowlistUsed && isAdminDevAllowlistConfigured();
  const showBypassBanner = isAdminBypassRlsEnabled();
  const currentRole = getHighestAdminRole(admin.roles) || "admin_readonly";

  return (
    <AdminShellClient
      currentRoleKey={currentRole}
      sidebarExpandedContent={
        <AdminSidebar
          roles={admin.roles}
          currentRoleKey={currentRole}
          emailOrId={admin.user.email || admin.user.id}
          strictPermissionBypassUsed={admin.strictPermissionBypassUsed}
          collapsed={false}
        />
      }
      sidebarCollapsedContent={
        <AdminSidebar
          roles={admin.roles}
          currentRoleKey={currentRole}
          emailOrId={admin.user.email || admin.user.id}
          strictPermissionBypassUsed={admin.strictPermissionBypassUsed}
          collapsed
        />
      }
      statusContent={
        <AdminStatusStack
          activeImpersonation={activeImpersonation}
          showAllowlistBanner={showAllowlistBanner}
          showBypassBanner={showBypassBanner}
        />
      }
    >
      {children}
    </AdminShellClient>
  );
}
