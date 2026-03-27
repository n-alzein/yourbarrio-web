import HomeBrowse from "@/components/browse/HomeBrowse";
import { getHomeBrowseData } from "@/lib/browse/getHomeBrowseData";
import { getLocationFromCookies } from "@/lib/location/getLocationFromCookies";

export const revalidate = 300;

export default async function CustomerHomePage() {
  const location = await getLocationFromCookies();

  const initialData = await getHomeBrowseData({
    mode: "customer",
    location,
  });

  return <HomeBrowse mode="customer" initialData={initialData} />;
}
