import { redirect } from "next/navigation";
import HomeBrowse from "@/components/browse/HomeBrowse";
import { getHomeBrowseData } from "@/lib/browse/getHomeBrowseData";
import { getCurrentUserRole } from "@/lib/auth/getCurrentUserRole";
import { getLocationFromCookies } from "@/lib/location/getLocationFromCookies";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const { role } = await getCurrentUserRole();
  if (role === "customer") redirect("/customer/home");
  if (role === "business") redirect("/business/dashboard");
  if (role === "admin") redirect("/admin");
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
