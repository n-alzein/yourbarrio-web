import { Suspense } from "react";
import { headers, cookies } from "next/headers";
import GlobalHeader from "@/components/nav/GlobalHeader";
import InactivityLogout from "@/components/auth/InactivityLogout";
import AuthSeed from "@/components/auth/AuthSeed";
import AuthRedirectGuard from "@/components/auth/AuthRedirectGuard";
import { requireEffectiveRole } from "@/lib/auth/requireEffectiveRole";
import { PATHS } from "@/lib/auth/paths";
import CustomerRealtimeProvider from "@/app/(customer)/customer/CustomerRealtimeProvider";
import { getAdminDataClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  other: {
    "yb-shell": "customer",
  },
};

function CustomerRouteShell({ children = null, className = "" }) {
  return (
    <div className={`pt-0 md:pt-12 min-h-screen${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}

export default async function CustomerLayout({ children }) {
  const headerList = await headers();
  const userAgent = headerList.get("user-agent") || "";
  const isSafari =
    userAgent.includes("Safari") &&
    !userAgent.includes("Chrome") &&
    !userAgent.includes("Chromium") &&
    !userAgent.includes("Edg") &&
    !userAgent.includes("OPR");
  const perfCookie = (await cookies()).get("yb-perf")?.value === "1";
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
        <CustomerRouteShell className={`customer-shell${isSafari ? " yb-safari" : ""}`}>
          <Suspense
            fallback={
              <div className="min-h-screen px-6 md:px-10 pt-24 text-white">
                <div className="max-w-5xl mx-auto rounded-2xl border border-white/10 bg-white/5 p-8">
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
