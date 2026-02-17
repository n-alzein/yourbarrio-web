import HomeBrowse from "@/components/browse/HomeBrowse";
import { getHomeBrowseData } from "@/lib/browse/getHomeBrowseData";
import { getCurrentUserRole } from "@/lib/auth/getCurrentUserRole";
import { getLocationFromCookies } from "@/lib/location/getLocationFromCookies";
import { redirectIfAllowed } from "@/lib/next/redirectIfAllowed";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const { role } = await getCurrentUserRole();
  if (role === "customer") await redirectIfAllowed("/customer/home");
  if (role === "business") await redirectIfAllowed("/go/dashboard");
  if (role === "admin") await redirectIfAllowed("/admin");
  // Deny-by-default for unknown role: keep public marketing surface.

  const location = await getLocationFromCookies();
  const city = (location?.city || "").trim() || null;
  const zip = (location?.zip || "").trim() || null;

  const initialData = await getHomeBrowseData({
    mode: "public",
    city,
    zip,
  });

  return <HomeBrowse mode="public" initialData={initialData} />;
}
