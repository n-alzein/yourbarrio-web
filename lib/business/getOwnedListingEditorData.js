import "server-only";

import { isUuid } from "@/lib/ids/isUuid";
import { getListingVariants } from "@/lib/listingOptions";
import { applyListingDraftDataToListing } from "@/lib/listingEditor";

export async function getOwnedListingEditorData({
  supabase,
  effectiveUserId,
  listingRef,
}) {
  const normalizedListingRef = String(listingRef || "").trim();
  if (!normalizedListingRef) {
    return {
      ok: false,
      status: 400,
      error: "Missing listing id",
    };
  }

  const field = isUuid(normalizedListingRef) ? "id" : "public_id";
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq(field, normalizedListingRef)
    .eq("business_id", effectiveUserId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      error: error.message || "Failed to load listing",
    };
  }

  if (!data) {
    return {
      ok: false,
      status: 404,
      error: "Not found",
    };
  }

  const baseListingOptions = await getListingVariants(supabase, data.id);
  const draftOverlay =
    String(data.status || "").trim().toLowerCase() === "published" &&
    data.has_unpublished_changes === true
      ? applyListingDraftDataToListing(data, data.draft_data)
      : { listing: data, listingOptions: null };

  return {
    ok: true,
    listing: draftOverlay.listing,
    listingOptions: draftOverlay.listingOptions || baseListingOptions,
    baseListing: data,
  };
}
