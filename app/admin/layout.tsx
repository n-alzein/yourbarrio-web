import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import AdminNav from "@/app/admin/_components/AdminNav";
import ImpersonationBanner from "@/app/admin/_components/ImpersonationBanner";
import AdminNavbar from "@/components/nav/AdminNavbar";
import { getEffectiveUserId } from "@/lib/admin/impersonation";
import { isAdminDevAllowlistConfigured, requireAdmin } from "@/lib/admin/permissions";
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

  return (
    <div className="yb-admin-shell min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <AdminNavbar />
      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-4 p-4 md:grid-cols-[220px_1fr]">
        <aside className="space-y-3">
          <h1 className="text-lg font-semibold">YourBarrio Admin</h1>
          <p className="text-xs text-neutral-400">Signed in as {admin.user.email || admin.user.id}</p>
          <AdminNav />
        </aside>
        <main className="space-y-4 flex-1">
          {showAllowlistBanner ? (
            <div className="rounded-md border border-yellow-700 bg-yellow-950/70 px-3 py-2 text-sm text-yellow-100">
              Dev allowlist is active for this admin session. Do not use in production.
            </div>
          ) : null}
          {showBypassBanner ? (
            <div className="rounded-md border border-orange-700 bg-orange-950/70 px-3 py-2 text-sm text-orange-100">
              ADMIN_BYPASS_RLS is enabled. Admin reads/writes are using service role in development only.
            </div>
          ) : null}
          {activeImpersonation ? (
            <ImpersonationBanner
              targetLabel={
                activeImpersonation.targetUserName ||
                activeImpersonation.targetUserEmail ||
                activeImpersonation.targetUserId
              }
              sessionId={activeImpersonation.sessionId}
            />
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
