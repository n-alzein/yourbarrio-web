import ListingDetailsClient from "./ListingDetailsClient";
import { getCurrentUserRole } from "@/lib/auth/getCurrentUserRole";

export default async function ListingDetailsPage({ params }) {
  const resolvedParams = await params;
  const { role } = await getCurrentUserRole();
  const backHref = role === "customer" ? "/customer/home" : "/";

  return <ListingDetailsClient params={resolvedParams} backHref={backHref} />;
}
