import BusinessLoginClient from "@/components/business-auth/BusinessLoginClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BusinessLoginPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const isPopup = resolvedSearchParams?.popup === "1";
  const callbackError =
    resolvedSearchParams?.error || resolvedSearchParams?.auth || "";
  return <BusinessLoginClient isPopup={isPopup} callbackError={callbackError} />;
}
