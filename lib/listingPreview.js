import "server-only";

import { getBusinessDataClientForRequest } from "@/lib/business/getBusinessDataClientForRequest";
import {
  PUBLIC_BUSINESS_SELECT,
  mapPublicBusinessRow,
} from "@/lib/business/publicBusinessQuery";
import { getOwnedListingEditorData } from "@/lib/business/getOwnedListingEditorData";
import { withListingPricing } from "@/lib/pricing";
import { resolveListingMedia } from "@/lib/resolveListingMedia";

function summarizeUrl(value) {
  const url = typeof value === "string" ? value.trim() : "";
  if (!url) return null;
  if (url.length <= 96) return url;
  return `${url.slice(0, 48)}...${url.slice(-24)}`;
}

function debugPreviewMedia(stage, listing, resolvedMedia) {
  if (process.env.NODE_ENV === "production") return;
  const draftData = listing?.draft_data && typeof listing.draft_data === "object" ? listing.draft_data : null;
  console.info("[LISTING_PREVIEW_MEDIA_DEBUG]", {
    stage,
    listingId: listing?.id || null,
    photo_url: summarizeUrl(listing?.photo_url),
    image_url: summarizeUrl(listing?.image_url),
    cover_image_id: listing?.cover_image_id || null,
    imagesLength: Array.isArray(listing?.images) ? listing.images.length : null,
    photosLength: Array.isArray(listing?.photos) ? listing.photos.length : null,
    draftDataKeys: draftData ? Object.keys(draftData) : [],
    draftDataImagesLength: Array.isArray(draftData?.images) ? draftData.images.length : null,
    draftDataPhotosLength: Array.isArray(draftData?.photos) ? draftData.photos.length : null,
    resolvedImagesLength: resolvedMedia?.images?.length ?? null,
    resolvedFirstImageUrl: summarizeUrl(resolvedMedia?.images?.[0]?.url || null),
  });
}

export async function getOwnedListingPreviewData(listingRef) {
  const access = await getBusinessDataClientForRequest();
  if (!access.ok) {
    return {
      ok: false,
      status: access.status,
      error: access.error,
    };
  }

  const supabase = access.client;
  const effectiveUserId = access.effectiveUserId;
  const normalizedListingRef = String(listingRef || "").trim();

  if (!normalizedListingRef) {
    return {
      ok: false,
      status: 400,
      error: "Missing listing id",
    };
  }

  const editorData = await getOwnedListingEditorData({
    supabase,
    effectiveUserId,
    listingRef: normalizedListingRef,
  });
  if (!editorData.ok) {
    return editorData;
  }

  debugPreviewMedia("editor_base", editorData.baseListing, { images: [] });
  debugPreviewMedia("editor_overlay", editorData.listing, { images: [] });
  const resolvedMedia = resolveListingMedia(editorData.listing);
  debugPreviewMedia("resolved", editorData.listing, resolvedMedia);

  const { data: businessRow, error: businessError } = await supabase
    .from("businesses")
    .select(PUBLIC_BUSINESS_SELECT)
    .eq("owner_user_id", effectiveUserId)
    .maybeSingle();

  if (businessError) {
    return {
      ok: false,
      status: 500,
      error: businessError.message || "Failed to load business",
    };
  }

  if (!businessRow) {
    return {
      ok: false,
      status: 404,
      error: "Business not found",
    };
  }

  return {
    ok: true,
    listing: {
      ...withListingPricing(editorData.listing),
      images: resolvedMedia.images,
    },
    business: mapPublicBusinessRow(businessRow),
    listingOptions: editorData.listingOptions,
    isSaved: false,
  };
}
