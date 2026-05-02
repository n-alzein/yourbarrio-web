import { Suspense } from "react";
import GlobalHeader from "@/components/nav/GlobalHeader";
import GlobalHeaderGate from "@/components/nav/GlobalHeaderGate";
import BusinessAuthRedirector from "@/components/BusinessAuthRedirector";
import PublicRouteShell from "@/components/layout/PublicRouteShell";
import { getCurrentAccountContext } from "@/lib/auth/getCurrentAccountContext";
import { normalizeAuthUser } from "@/lib/auth/normalizeAuthUser";
import { getRequestPath } from "@/lib/url/getRequestPath";

export const metadata = {
  other: {
    "yb-shell": "public",
  },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicLayout({ children }) {
  const requestPath = await getRequestPath("/");
  const shellGap = requestPath === "/" ? "none" : "comfortable";
  const accountContext = await getCurrentAccountContext({
    source: "public-layout",
  });
  const forcedAuth = accountContext?.isAuthenticated
    ? {
        role:
          accountContext.role ||
          accountContext.profile?.role ||
          accountContext.user?.app_metadata?.role ||
          accountContext.user?.user_metadata?.role ||
          null,
        user: normalizeAuthUser(accountContext.user),
        profile: accountContext.profile ?? null,
      }
    : null;

  const lightThemeVars = {
    "--bg-solid": "#ffffff",
    "--bg-gradient-start": "#f7f7f8",
    "--bg-gradient-end": "#eef2ff",
    "--glow-1": "rgba(79, 70, 229, 0.1)",
    "--glow-2": "rgba(14, 165, 233, 0.08)",
  };

  return (
    <div
      className="min-h-screen bg-[var(--yb-bg)] text-[var(--yb-text)]"
      data-theme="light"
      data-route-theme="light"
      style={lightThemeVars}
    >
      <Suspense fallback={null}>
        <GlobalHeaderGate>
          <GlobalHeader surface="public" forcedAuth={forcedAuth} />
        </GlobalHeaderGate>
      </Suspense>
      <BusinessAuthRedirector />
      <PublicRouteShell gap={shellGap}>{children}</PublicRouteShell>
    </div>
  );
}
