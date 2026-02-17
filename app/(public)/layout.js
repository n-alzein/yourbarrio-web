import { Suspense } from "react";
import GlobalHeader from "@/components/nav/GlobalHeader";
import GlobalHeaderGate from "@/components/nav/GlobalHeaderGate";
import BusinessAuthRedirector from "@/components/BusinessAuthRedirector";

export const metadata = {
  other: {
    "yb-shell": "public",
  },
};

export default function PublicLayout({ children }) {
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
          <GlobalHeader surface="public" />
        </GlobalHeaderGate>
      </Suspense>
      <BusinessAuthRedirector />
      {children}
    </div>
  );
}
