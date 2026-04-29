import { Suspense } from "react";
import GlobalHeader from "@/components/nav/GlobalHeader";
import CustomerRouteShell from "@/components/layout/CustomerRouteShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function CartLayout({ children }) {
  return (
    <>
      <Suspense fallback={null}>
        <GlobalHeader surface="customer" />
      </Suspense>
      <CustomerRouteShell>
        <div className="min-h-screen pt-[2.25rem] md:pt-[2.5rem]">{children}</div>
      </CustomerRouteShell>
    </>
  );
}
