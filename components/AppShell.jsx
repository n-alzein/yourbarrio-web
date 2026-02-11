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

export default function AppShell({ children }) {
  const pathname = usePathname();
  const flushFooterOnHome = pathname === "/" || pathname === "/customer/home";

  return (
    <div
      className="app-shell-root relative min-h-screen overflow-x-hidden w-full antialiased text-white flex flex-col"
      style={{ paddingTop: "calc(5rem + var(--yb-support-mode-offset, 0px))" }}
    >
      <CrashLoggerClient />
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
              <RealtimeProvider>
                <CartProvider>
                  <ModalMount>
                    <main className="flex-1 w-full min-h-screen">{children}</main>
                    <Footer className={flushFooterOnHome ? "mt-0 border-t-0" : undefined} />
                  </ModalMount>
                </CartProvider>
              </RealtimeProvider>
            </AuthProvider>
          </LocationProvider>
        </Suspense>
      </ThemeProvider>
      <DebugToolsClient />
      <SafariLayersDebug />
      <StallRecorderClient />
      <SafariNavGuardClient />
      <SafariDesktopClassClient />
    </div>
  );
}
