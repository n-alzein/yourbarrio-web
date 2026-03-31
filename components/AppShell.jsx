"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import Footer from "@/components/Footer";
import ModalMount from "@/components/modals/ModalMount";
import { ThemeProvider } from "@/components/ThemeProvider";
import OverlayGuard from "@/components/OverlayGuard";
import DevOnlyNavRecorderLoader from "@/components/DevOnlyNavRecorderLoader";
import DebugToolsClient from "@/components/debug/DebugToolsClient";
import SafariLayersDebug from "@/components/debug/SafariLayersDebug";
import StallRecorderClient from "@/components/debug/StallRecorderClient";
import RscLoopDiagClient from "@/components/debug/RscLoopDiagClient";
import ThemeDiagnostics from "@/components/debug/ThemeDiagnostics";
import SafariNavGuardClient from "@/components/nav/SafariNavGuardClient";
import SafariDesktopClassClient from "@/components/SafariDesktopClassClient";
import CrashLoggerClient from "@/components/CrashLoggerClient";
import WebVitalsReporter from "@/components/WebVitalsReporter";
import { AuthProvider } from "@/components/AuthProvider";
import ScrollToTop from "@/components/ScrollToTop";
import { CartProvider } from "@/components/cart/CartProvider";
import { LocationProvider } from "@/components/location/LocationProvider";
import UrlLocationMigratorClient from "@/components/location/UrlLocationMigratorClient";
import RealtimeProvider from "@/components/realtime/RealtimeProvider";
import AutoRefreshGuardBanner from "@/components/auth/AutoRefreshGuardBanner";

export default function AppShell({ children }) {
  const pathname = usePathname();
  const flushFooterOnHome = pathname === "/" || pathname === "/customer/home";
  const isOnboardingRoute = pathname === "/onboarding";
  const flushFooterOnBusiness =
    pathname === "/onboarding" || pathname === "/business" || pathname?.startsWith("/business/");
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const shellKind = isOnboardingRoute ? "onboarding" : isAdminRoute ? "admin" : "default";
  const lightThemeVars = {
    "--bg-solid": "#ffffff",
    "--bg-gradient-start": "#f7f7f8",
    "--bg-gradient-end": "#eef2ff",
    "--glow-1": "rgba(79, 70, 229, 0.1)",
    "--glow-2": "rgba(14, 165, 233, 0.08)",
  };

  return (
    <div
      className="app-shell-root relative min-h-screen overflow-x-hidden w-full antialiased text-[var(--yb-text)] flex flex-col"
      style={lightThemeVars}
      data-theme-root="1"
      data-theme="light"
      data-shell-kind={shellKind}
    >
      <CrashLoggerClient />
      <RscLoopDiagClient />
      <WebVitalsReporter />
      <ScrollToTop />
      <DevOnlyNavRecorderLoader />
      <ThemeProvider forcedTheme="light">
        <OverlayGuard />
        <div className="absolute inset-0 -z-10 overflow-hidden h-full">
          <div
            className="app-shell-bg-solid absolute inset-0"
            style={{ background: "var(--bg-solid)" }}
          />
          <div
            className="app-shell-bg-gradient absolute inset-0"
            style={{
              background: "linear-gradient(to bottom, var(--bg-gradient-start), var(--bg-gradient-end))",
            }}
          />
          <div className="app-shell-glow pointer-events-none absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full blur-[120px] bg-[var(--glow-1)]" />
          <div className="app-shell-glow pointer-events-none absolute top-40 -right-24 h-[480px] w-[480px] rounded-full blur-[120px] bg-[var(--glow-2)]" />
          <div className="animated-bg" />
        </div>

        {/* Single provider tree; LocationProvider is the source of truth for city/ZIP. */}
        <Suspense fallback={null}>
          <LocationProvider>
            <UrlLocationMigratorClient />
            <AuthProvider>
              <AutoRefreshGuardBanner />
              <RealtimeProvider>
                <CartProvider>
                  <ModalMount>
                    <main
                      className="flex-1 w-full min-h-screen"
                      style={{ paddingTop: "0px" }}
                      data-app-shell-main="1"
                      data-shell-kind={shellKind}
                    >
                      {children}
                    </main>
                    <Footer
                      className={
                        flushFooterOnHome
                          ? "mt-0 border-t-0"
                          : flushFooterOnBusiness
                            ? "mt-0"
                            : undefined
                      }
                    />
                  </ModalMount>
                </CartProvider>
              </RealtimeProvider>
            </AuthProvider>
          </LocationProvider>
        </Suspense>
      </ThemeProvider>
      <DebugToolsClient />
      <ThemeDiagnostics />
      <SafariLayersDebug />
      <StallRecorderClient />
      <SafariNavGuardClient />
      <SafariDesktopClassClient />
    </div>
  );
}
