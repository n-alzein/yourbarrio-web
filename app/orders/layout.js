import { Suspense } from "react";
import GlobalHeader from "@/components/nav/GlobalHeader";
import CustomerRouteShell from "@/components/layout/CustomerRouteShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function OrdersLayout({ children }) {
  return (
    <>
      <Suspense fallback={null}>
        <GlobalHeader surface="customer" />
      </Suspense>
      <CustomerRouteShell gap="comfortable">
        <div className="min-h-screen">{children}</div>
      </CustomerRouteShell>
    </>
  );
}
