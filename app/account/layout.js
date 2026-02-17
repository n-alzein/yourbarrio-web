import { Suspense } from "react";
import { headers, cookies } from "next/headers";
import GlobalHeader from "@/components/nav/GlobalHeader";
import InactivityLogout from "@/components/auth/InactivityLogout";
import AuthSeed from "@/components/auth/AuthSeed";
import AccountNavPerf from "@/components/debug/AccountNavPerf";
import { requireRole } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function AccountShell({ children = null, className = "" }) {
  const lightThemeVars = {
    "--bg-solid": "#ffffff",
    "--bg-gradient-start": "#f7f7f8",
    "--bg-gradient-end": "#eef2ff",
    "--glow-1": "rgba(79, 70, 229, 0.1)",
    "--glow-2": "rgba(14, 165, 233, 0.08)",
  };

  return (
    <div
      className={`pt-28 md:pt-20 min-h-screen bg-[var(--yb-bg)] text-[var(--yb-text)]${className ? ` ${className}` : ""}`}
      data-theme="light"
      data-route-theme="light"
      style={lightThemeVars}
    >
      {children}
    </div>
  );
}

export default async function AccountLayout({ children }) {
  const headerList = await headers();
  const userAgent = headerList.get("user-agent") || "";
  const isSafari =
    userAgent.includes("Safari") &&
    !userAgent.includes("Chrome") &&
    !userAgent.includes("Chromium") &&
    !userAgent.includes("Edg") &&
    !userAgent.includes("OPR");
  const perfCookie = (await cookies()).get("yb-perf")?.value === "1";
  const { user, profile } = await requireRole("customer");

  return (
    <>
      {isSafari ? (
        <style>{`
          .account-shell.yb-safari .backdrop-blur-xl,
          .account-shell.yb-safari .backdrop-blur-lg,
          .account-shell.yb-safari .backdrop-blur-md,
          .account-shell.yb-safari .use-backdrop-blur {
            -webkit-backdrop-filter: none !important;
            backdrop-filter: none !important;
            background: var(--color-surface) !important;
          }
          .account-shell.yb-safari .app-shell-glow,
          .account-shell.yb-safari .animated-bg {
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
      <AuthSeed user={user} profile={profile} role="customer" />
      <Suspense fallback={null}>
        <GlobalHeader surface="customer" />
      </Suspense>
      <InactivityLogout />
      <AccountNavPerf />
      <AccountShell className={`account-shell${isSafari ? " yb-safari" : ""}`}>
        <Suspense fallback={null}>{children}</Suspense>
      </AccountShell>
    </>
  );
}
