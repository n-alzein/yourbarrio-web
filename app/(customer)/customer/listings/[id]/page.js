import ListingDetailsClient from "@/app/(public)/listings/[id]/ListingDetailsClient";

export default async function CustomerListingDetails({ params }) {
  const resolvedParams = await params;
  return <ListingDetailsClient params={resolvedParams} backHref="/customer/home" />;
}
