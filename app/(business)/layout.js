import { Suspense } from "react";
import { redirect } from "next/navigation";
import BusinessNavbar from "@/components/navbars/BusinessNavbar";
import InactivityLogout from "@/components/auth/InactivityLogout";
import AuthSeed from "@/components/auth/AuthSeed";
import AuthRedirectGuard from "@/components/auth/AuthRedirectGuard";
import { requireEffectiveRole } from "@/lib/auth/requireEffectiveRole";
import { getCurrentUserRole } from "@/lib/auth/getCurrentUserRole";
import { PATHS } from "@/lib/auth/paths";
import { getRequestPath } from "@/lib/url/getRequestPath";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  other: {
    "yb-shell": "business",
  },
};

function BusinessRouteShell({ children = null }) {
  return <div className="pt-8 md:pt-10 min-h-screen">{children}</div>;
}

export default async function BusinessLayout({ children }) {
  const requestPath = await getRequestPath(PATHS.business.dashboard);
  const { role } = await getCurrentUserRole();
  if (role === "anon") {
    redirect(`/signin?modal=signin&next=${encodeURIComponent(requestPath)}`);
  }
  if (role !== "business") {
    if (role === "customer") redirect(PATHS.customer.home);
    if (role === "admin") redirect("/admin");
    redirect("/not-authorized");
  }

  const {
    user,
    authUser,
    profile,
    effectiveProfile,
    effectiveUserId,
    effectiveRole,
    supportMode,
    targetRole,
  } = await requireEffectiveRole("business");

  return (
    <>
      <AuthSeed
        user={user}
        profile={effectiveProfile || profile}
        role={targetRole || effectiveRole || "business"}
      />
      <AuthRedirectGuard redirectTo={PATHS.auth.businessLogin}>
        <BusinessNavbar
          requireAuth
          forcedAuth={{
            supportMode,
            role: targetRole || effectiveRole || "business",
            user: {
              ...(authUser || user || {}),
              id: effectiveUserId || user?.id,
            },
            profile: effectiveProfile || profile || null,
          }}
        />
        <InactivityLogout />
        <BusinessRouteShell>
          <Suspense
            fallback={
              <div className="min-h-screen px-6 md:px-10 pt-24 text-white">
                <div className="max-w-5xl mx-auto rounded-2xl border border-white/10 bg-white/5 p-8">
                  Loading business workspace...
                </div>
              </div>
            }
          >
            {children}
          </Suspense>
        </BusinessRouteShell>
      </AuthRedirectGuard>
    </>
  );
}
