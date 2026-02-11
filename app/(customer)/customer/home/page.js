import HomeBrowse from "@/components/browse/HomeBrowse";
import { getHomeBrowseData } from "@/lib/browse/getHomeBrowseData";
import { getLocationFromCookies } from "@/lib/location/getLocationFromCookies";

export const revalidate = 300;

export default async function CustomerHomePage() {
  const location = await getLocationFromCookies();
  const city = (location?.city || "").trim() || null;
  const zip = (location?.zip || "").trim() || null;

  const initialData = await getHomeBrowseData({
    mode: "customer",
    city,
    zip,
  });

  return <HomeBrowse mode="customer" initialData={initialData} />;
}
