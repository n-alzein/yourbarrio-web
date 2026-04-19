import { Suspense } from "react";
import BusinessNavbar from "@/components/navbars/BusinessNavbar";
import InactivityLogout from "@/components/auth/InactivityLogout";
import AuthSeed from "@/components/auth/AuthSeed";
import AuthRedirectGuard from "@/components/auth/AuthRedirectGuard";
import ProtectedRouteLoginPrompt from "@/components/auth/ProtectedRouteLoginPrompt";
import { requireEffectiveRole } from "@/lib/auth/requireEffectiveRole";
import { getBusinessSessionExpiredLoginPath } from "@/lib/auth/paths";
import { isRscPrefetchRequest } from "@/lib/next/isRscPrefetchRequest";
import { requireBusinessRowOrOnboarding } from "@/lib/business/requireBusinessRow";
import { getServerAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  other: {
    "yb-shell": "business",
  },
};

function BusinessRouteShell({ children = null }) {
  return (
    <div
      className="min-h-screen flex-1 bg-[var(--yb-bg)] text-[var(--yb-text)]"
      data-theme="light"
      style={{
        "--bg-solid": "#ffffff",
        "--bg-gradient-start": "#f7f7f8",
        "--bg-gradient-end": "#eef2ff",
        "--glow-1": "rgba(79, 70, 229, 0.1)",
        "--glow-2": "rgba(14, 165, 233, 0.08)",
      }}
    >
      {children}
    </div>
  );
}

export default async function BusinessLayout({ children }) {
  const isRsc = await isRscPrefetchRequest();
  if (isRsc) {
    return <>{children}</>;
  }

  const { user: sessionUser } = await getServerAuth();
  if (!sessionUser) {
    return (
      <>
        <AuthSeed user={null} profile={null} role={null} />
        <BusinessRouteShell>
          <div className="min-h-screen px-6 md:px-10 pt-24 text-[var(--yb-text)]">
            <div className="mx-auto max-w-5xl rounded-2xl border border-[var(--yb-border)] bg-white p-8">
              Loading business workspace...
            </div>
          </div>
          <ProtectedRouteLoginPrompt role="business" />
        </BusinessRouteShell>
      </>
    );
  }

  const businessContext = await requireEffectiveRole("business");
  const user = businessContext.user;
  const authUser = businessContext.authUser;
  const profile = businessContext.actorProfile || null;
  const effectiveProfile = businessContext.effectiveProfile;
  const effectiveUserId = businessContext.effectiveUserId;
  const effectiveRole =
    businessContext.targetRole ||
    businessContext.effectiveProfile?.role ||
    businessContext.actorProfile?.role ||
    "business";
  const supportMode = businessContext.supportMode;
  const targetRole = businessContext.targetRole;

  if (!supportMode) {
    await requireBusinessRowOrOnboarding();
  }

  const content = (
    <div className="min-h-screen flex flex-col bg-[var(--yb-bg)] text-[var(--yb-text)]" data-theme="light">
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
            fallback={null}
        >
          {children}
        </Suspense>
      </BusinessRouteShell>
    </div>
  );

  return (
    <>
      <AuthSeed
        user={user}
        profile={effectiveProfile || profile}
        role={targetRole || effectiveRole || "business"}
      />
      <AuthRedirectGuard redirectTo={getBusinessSessionExpiredLoginPath()}>
        {content}
      </AuthRedirectGuard>
    </>
  );
}
