import { notFound, redirect } from "next/navigation";
import ListingDetailsClient from "@/app/(public)/listings/[id]/ListingDetailsClient";
import { getOwnedListingPreviewData } from "@/lib/listingPreview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BusinessListingPreviewPage({ params, searchParams }) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const listingRef = Array.isArray(resolvedParams?.id)
    ? resolvedParams.id[0]
    : resolvedParams?.id;
  const isFromEditorPreview = resolvedSearchParams?.fromEditor === "1";

  const preview = await getOwnedListingPreviewData(listingRef);

  if (!preview.ok) {
    if (preview.status === 401) {
      const previewPath = `/business/listings/${listingRef}/preview${
        isFromEditorPreview ? "?fromEditor=1" : ""
      }`;
      redirect(`/business/login?next=${encodeURIComponent(previewPath)}`);
    }
    notFound();
  }

  const editorHref = `/business/listings/${encodeURIComponent(listingRef)}/edit`;

  return (
    <ListingDetailsClient
      params={resolvedParams}
      renderedAt={new Date().toISOString()}
      initialListing={preview.listing}
      initialBusiness={preview.business}
      initialListingOptions={preview.listingOptions}
      initialIsSaved={preview.isSaved}
      previewBanner={{ editorHref, isFromEditorPreview }}
    />
  );
}
