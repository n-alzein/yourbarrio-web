import { Suspense } from "react";
import GlobalHeader from "@/components/nav/GlobalHeader";
import { getCurrentAccountContext } from "@/lib/auth/getCurrentAccountContext";
import { normalizeAuthUser } from "@/lib/auth/normalizeAuthUser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CheckoutLayout({ children }) {
  const accountContext = await getCurrentAccountContext({
    source: "checkout-layout",
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

  return (
    <>
      <Suspense fallback={null}>
        <GlobalHeader surface="customer" forcedAuth={forcedAuth} />
      </Suspense>
      <div className="pt-28 md:pt-20 min-h-screen">{children}</div>
    </>
  );
}
