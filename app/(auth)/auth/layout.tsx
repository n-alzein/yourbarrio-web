import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-route-shell min-h-screen w-full bg-white text-slate-900">
      <style>{`
        .auth-route-shell .app-shell-root {
          padding-top: 0 !important;
          background: #ffffff !important;
          color: #0f172a !important;
        }

        .auth-route-shell .app-shell-root > .absolute.inset-0.-z-10 {
          display: none !important;
        }

        .auth-route-shell main {
          min-height: 100vh !important;
          background: #ffffff !important;
          color: #0f172a !important;
        }

        .auth-route-shell footer {
          margin-top: 0 !important;
          border-top-color: transparent !important;
          background: #ffffff !important;
        }
      `}</style>
      <div className="min-h-screen w-full bg-white text-slate-900">{children}</div>
    </div>
  );
}
