import HomeBrowse from "@/components/browse/HomeBrowse";
import { getHomeBrowseData } from "@/lib/browse/getHomeBrowseData";
import { getCurrentUserRole } from "@/lib/auth/getCurrentUserRole";
import { getLocationFromCookies } from "@/lib/location/getLocationFromCookies";
import { redirectIfAllowed } from "@/lib/next/redirectIfAllowed";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const { user, role } = await getCurrentUserRole();
  if (role === "customer") {
    console.warn("[BUSINESS_REDIRECT_TRACE] homepage", {
      pathname: "/",
      userId: user?.id || null,
      role,
      sessionExists: Boolean(user?.id),
      password_set: null,
      onboardingState: null,
      redirectDestination: "/customer/home",
      redirectReason: "homepage_customer_redirect",
    });
    await redirectIfAllowed("/customer/home");
  }
  if (role === "business") {
    console.warn("[BUSINESS_REDIRECT_TRACE] homepage", {
      pathname: "/",
      userId: user?.id || null,
      role,
      sessionExists: Boolean(user?.id),
      password_set: null,
      onboardingState: null,
      redirectDestination: "/go/dashboard",
      redirectReason: "homepage_business_redirect",
    });
    await redirectIfAllowed("/go/dashboard");
  }
  if (role === "admin") {
    console.warn("[BUSINESS_REDIRECT_TRACE] homepage", {
      pathname: "/",
      userId: user?.id || null,
      role,
      sessionExists: Boolean(user?.id),
      password_set: null,
      onboardingState: null,
      redirectDestination: "/admin",
      redirectReason: "homepage_admin_redirect",
    });
    await redirectIfAllowed("/admin");
  }
  // Deny-by-default for unknown role: keep public marketing surface.

  const location = await getLocationFromCookies();

  const initialData = await getHomeBrowseData({
    mode: "public",
    location,
  });

  return <HomeBrowse mode="public" initialData={initialData} />;
}
