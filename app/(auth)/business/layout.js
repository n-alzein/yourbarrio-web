import { Suspense } from "react";
import GlobalHeader from "@/components/nav/GlobalHeader";

export default function BusinessAuthMarketingLayout({ children }) {
  return (
    <div className="min-h-screen bg-white text-slate-900" data-theme="light">
      <Suspense fallback={null}>
        <GlobalHeader surface="public" showSearch={false} minimal />
      </Suspense>
      <div className="h-20" aria-hidden="true" />
      <div className="px-6 pb-24 pt-12">
        <div className="mx-auto flex w-full max-w-6xl justify-center">
          {children}
        </div>
      </div>
    </div>
  );
}
