import { redirect } from "next/navigation";
import HomeBrowse from "@/components/browse/HomeBrowse";
import { getHomeBrowseData } from "@/lib/browse/getHomeBrowseData";
import { getCurrentUserRole } from "@/lib/auth/getCurrentUserRole";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function toSearchParamsObject(value) {
  if (!value) return {};
  if (typeof value.then === "function") return value;
  return value;
}

export default async function HomePage({ searchParams }) {
  const { role } = await getCurrentUserRole();
  if (role === "customer") redirect("/customer/home");
  if (role === "business") redirect("/business/dashboard");
  if (role === "admin") redirect("/admin");
  // Deny-by-default for unknown role: keep public marketing surface.

  const resolvedSearchParams = await toSearchParamsObject(searchParams);
  const city = resolvedSearchParams?.city || null;
  const zip = resolvedSearchParams?.zip || null;

  const initialData = await getHomeBrowseData({
    mode: "public",
    city,
    zip,
  });

  return <HomeBrowse mode="public" initialData={initialData} />;
}
