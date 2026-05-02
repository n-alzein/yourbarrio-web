import { Suspense } from "react";
import { headers, cookies } from "next/headers";
import GlobalHeader from "@/components/nav/GlobalHeader";
import CustomerRouteShell from "@/components/layout/CustomerRouteShell";
import InactivityLogout from "@/components/auth/InactivityLogout";
import AuthSeed from "@/components/auth/AuthSeed";
import AuthRedirectGuard from "@/components/auth/AuthRedirectGuard";
import ProtectedRouteLoginPrompt from "@/components/auth/ProtectedRouteLoginPrompt";
import { requireEffectiveRole } from "@/lib/auth/requireEffectiveRole";
import { PATHS } from "@/lib/auth/paths";
import CustomerRealtimeProvider from "@/app/(customer)/customer/CustomerRealtimeProvider";
import { getAdminDataClient } from "@/lib/supabase/admin";
import { isRscPrefetchRequest } from "@/lib/next/isRscPrefetchRequest";
import { getRequestPath } from "@/lib/url/getRequestPath";
import { getFeatureFlag, CUSTOMER_NEARBY_PUBLIC_FLAG_KEY } from "@/lib/featureFlags";
import { getServerAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  other: {
    "yb-shell": "customer",
  },
};

export default async function CustomerLayout({ children }) {
  const isRsc = await isRscPrefetchRequest();
  if (isRsc) {
    return <>{children}</>;
  }
  const requestPath = await getRequestPath("/customer/home");
  const shellGap = requestPath === "/customer/home" ? "none" : "comfortable";
  const isNearbyRoute =
    requestPath === "/customer/nearby" || requestPath.startsWith("/customer/nearby/");
  const isNearbyPublicEnabled = isNearbyRoute
    ? await getFeatureFlag(CUSTOMER_NEARBY_PUBLIC_FLAG_KEY)
    : false;
  const serverAuth = await getServerAuth();
  const nearbyAuth = isNearbyPublicEnabled ? serverAuth : null;

  const headerList = await headers();
  const userAgent = headerList.get("user-agent") || "";
  const isSafari =
    userAgent.includes("Safari") &&
    !userAgent.includes("Chrome") &&
    !userAgent.includes("Chromium") &&
    !userAgent.includes("Edg") &&
    !userAgent.includes("OPR");
  const perfCookie = (await cookies()).get("yb-perf")?.value === "1";

  if (isNearbyPublicEnabled && !nearbyAuth?.user) {
    return (
      <>
        <AuthSeed
          user={null}
          profile={null}
          role="customer"
          supportModeActive={false}
        />
        <Suspense fallback={null}>
          <GlobalHeader surface="customer" />
        </Suspense>
        <CustomerRouteShell
          className={`customer-shell${isSafari ? " yb-safari" : ""}`}
          gap={shellGap}
        >
          <Suspense
            fallback={
              <div className="min-h-screen px-6 md:px-10 text-[var(--yb-text)] bg-[var(--yb-bg)]">
                <div className="max-w-5xl mx-auto rounded-2xl border border-[var(--yb-border)] bg-white p-8">
                  Loading nearby businesses...
                </div>
              </div>
            }
          >
            {children}
          </Suspense>
        </CustomerRouteShell>
      </>
    );
  }

  if (!serverAuth?.user && !isNearbyPublicEnabled) {
    return (
      <>
        <AuthSeed
          user={null}
          profile={null}
          role={null}
          supportModeActive={false}
        />
        <Suspense fallback={null}>
          <GlobalHeader surface="customer" />
        </Suspense>
        <CustomerRouteShell
          className={`customer-shell${isSafari ? " yb-safari" : ""}`}
          gap={shellGap}
        >
          <div className="min-h-screen px-6 md:px-10 text-[var(--yb-text)] bg-[var(--yb-bg)]">
            <div className="max-w-5xl mx-auto rounded-2xl border border-[var(--yb-border)] bg-white p-8">
              Loading your account...
            </div>
          </div>
          <ProtectedRouteLoginPrompt role="customer" redirectTo={requestPath} />
        </CustomerRouteShell>
      </>
    );
  }

  const {
    user,
    profile,
    effectiveProfile,
    effectiveUserId,
    effectiveRole,
    supportMode,
    targetRole,
  } = await requireEffectiveRole("customer");

  const resolvedProfile = effectiveProfile || profile || null;
  const supportModeActive = Boolean(
    supportMode && effectiveUserId && (targetRole || effectiveRole) === "customer"
  );
  let supportTargetUser = null;
  if (supportModeActive && effectiveUserId) {
    try {
      const { client } = await getAdminDataClient({ mode: "service" });
      const { data } = await client
        .from("users")
        .select(
          "id,email,full_name,profile_photo_url,role,phone,city,address,address_2,state,postal_code"
        )
        .eq("id", effectiveUserId)
        .maybeSingle();
      supportTargetUser = data || null;
    } catch {
      supportTargetUser = null;
    }
  }
  const seededProfile =
    (supportModeActive ? supportTargetUser : null) || resolvedProfile || null;
  const seededUser =
    supportModeActive
      ? {
          id: effectiveUserId,
          email: seededProfile?.email || null,
          user_metadata: {
            full_name:
              seededProfile?.full_name ||
              null,
            avatar_url:
              seededProfile?.profile_photo_url ||
              null,
          },
          app_metadata: {
            role: seededProfile?.role || targetRole || "customer",
          },
        }
      : user;

  return (
    <>
      {isSafari ? (
        <style>{`
          .customer-shell.yb-safari .backdrop-blur-xl,
          .customer-shell.yb-safari .backdrop-blur-lg,
          .customer-shell.yb-safari .backdrop-blur-md,
          .customer-shell.yb-safari .use-backdrop-blur {
            -webkit-backdrop-filter: none !important;
            backdrop-filter: none !important;
            background: var(--color-surface) !important;
          }
          .customer-shell.yb-safari .app-shell-glow,
          .customer-shell.yb-safari .animated-bg {
            display: none !important;
          }
        `}</style>
      ) : null}
      {isSafari && perfCookie ? (
        <script
          dangerouslySetInnerHTML={{
            __html:
              'console.log(\"[nav-guard] applied (customer) – reused business login fix\")',
          }}
        />
      ) : null}
      <AuthSeed
        user={seededUser}
        profile={seededProfile}
        role={seededProfile?.role || targetRole || effectiveRole || "customer"}
        supportModeActive={supportModeActive}
      />
      <AuthRedirectGuard redirectTo={PATHS.auth.customerLogin}>
        <Suspense fallback={null}>
          <GlobalHeader
            surface="customer"
            forcedAuth={{
              supportMode: supportModeActive,
              role: seededProfile?.role || targetRole || effectiveRole || "customer",
              user: seededUser,
              profile: seededProfile,
            }}
          />
        </Suspense>
        <InactivityLogout />
        <CustomerRouteShell
          className={`customer-shell${isSafari ? " yb-safari" : ""}`}
          gap={shellGap}
        >
          <Suspense
            fallback={
              <div className="min-h-screen px-6 md:px-10 text-[var(--yb-text)] bg-[var(--yb-bg)]">
                <div className="max-w-5xl mx-auto rounded-2xl border border-[var(--yb-border)] bg-white p-8">
                  Loading your account...
                </div>
              </div>
            }
          >
            <CustomerRealtimeProvider>{children}</CustomerRealtimeProvider>
          </Suspense>
        </CustomerRouteShell>
      </AuthRedirectGuard>
    </>
  );
}
