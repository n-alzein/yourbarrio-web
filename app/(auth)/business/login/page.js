import BusinessLoginClient from "@/components/business-auth/BusinessLoginClient";
import { BUSINESS_LOGIN_SESSION_EXPIRED_REASON } from "@/lib/auth/paths";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BusinessLoginPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const callbackError =
    resolvedSearchParams?.error || resolvedSearchParams?.auth || "";
  const sessionExpired =
    resolvedSearchParams?.reason === BUSINESS_LOGIN_SESSION_EXPIRED_REASON;
  return (
    <BusinessLoginClient
      isPopup={false}
      callbackError={callbackError}
      sessionExpired={sessionExpired}
    />
  );
}
