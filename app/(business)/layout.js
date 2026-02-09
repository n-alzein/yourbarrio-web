import { Suspense } from "react";
import BusinessNavbar from "@/components/navbars/BusinessNavbar";
import InactivityLogout from "@/components/auth/InactivityLogout";
import AuthSeed from "@/components/auth/AuthSeed";
import AuthRedirectGuard from "@/components/auth/AuthRedirectGuard";
import { requireEffectiveRole } from "@/lib/auth/requireEffectiveRole";
import { PATHS } from "@/lib/auth/paths";

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
