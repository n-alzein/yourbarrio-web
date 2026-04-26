import {
  extractStoredPhotoVariants,
  getSelectedPhotoUrl,
} from "@/lib/listingPhotos";

function normalizeExplicitImage(image, index) {
  if (!image) return null;
  if (typeof image === "string") {
    const url = image.trim();
    return url
      ? {
          id: url,
          url,
          is_cover: false,
        }
      : null;
  }
  if (typeof image !== "object") return null;
  const url =
    typeof image.url === "string"
      ? image.url.trim()
      : typeof image.publicUrl === "string"
      ? image.publicUrl.trim()
      : typeof image.public_url === "string"
      ? image.public_url.trim()
      : typeof image.image_url === "string"
      ? image.image_url.trim()
      : typeof image.storage_path === "string"
      ? image.storage_path.trim()
      : typeof image.original?.url === "string"
      ? image.original.url.trim()
      : typeof image.original?.publicUrl === "string"
      ? image.original.publicUrl.trim()
      : typeof image.original?.public_url === "string"
      ? image.original.public_url.trim()
      : typeof image.enhanced?.url === "string"
      ? image.enhanced.url.trim()
      : typeof image.enhanced?.publicUrl === "string"
      ? image.enhanced.publicUrl.trim()
      : typeof image.enhanced?.public_url === "string"
      ? image.enhanced.public_url.trim()
      : "";
  if (!url) return null;
  const id =
    typeof image.id === "string" && image.id.trim()
      ? image.id.trim()
      : url || `image-${index + 1}`;
  return {
    ...image,
    id,
    url,
    is_cover: image.is_cover === true,
  };
}

function resolveSourceListing(listing) {
  if (!listing || typeof listing !== "object") return null;
  const draftData =
    listing.draft_data && typeof listing.draft_data === "object" ? listing.draft_data : null;
  const hasDraftMedia =
    Array.isArray(draftData?.images) ||
    Array.isArray(draftData?.photos) ||
    Array.isArray(draftData?.listing_images) ||
    Array.isArray(draftData?.listing_photos) ||
    Array.isArray(draftData?.photo_variants) ||
    Boolean(draftData?.photo_url) ||
    Boolean(draftData?.image_url);

  if (!hasDraftMedia) return listing;

  return {
    ...listing,
    ...draftData,
    ...(Array.isArray(draftData?.images)
      ? { images: draftData.images }
      : Array.isArray(draftData?.photos)
      ? { images: draftData.photos }
      : Array.isArray(draftData?.listing_images)
      ? { images: draftData.listing_images }
      : Array.isArray(draftData?.listing_photos)
      ? { images: draftData.listing_photos }
      : {}),
    cover_image_id:
      draftData?.cover_image_id !== undefined ? draftData.cover_image_id : listing.cover_image_id,
  };
}

export function resolveListingMedia(listing) {
  const sourceListing = resolveSourceListing(listing);
  if (!sourceListing) {
    return {
      images: [],
      coverImage: null,
      coverImageUrl: null,
    };
  }

  const rawExplicitImages = Array.isArray(sourceListing.images)
    ? sourceListing.images
    : Array.isArray(sourceListing.photos)
    ? sourceListing.photos
    : Array.isArray(sourceListing.listing_images)
    ? sourceListing.listing_images
    : Array.isArray(sourceListing.listing_photos)
    ? sourceListing.listing_photos
    : [];

  const explicitImages = rawExplicitImages.length
    ? rawExplicitImages.map(normalizeExplicitImage).filter(Boolean)
    : [];

  const derivedImages = explicitImages.length
    ? explicitImages
    : extractStoredPhotoVariants(
        sourceListing.photo_url ||
          sourceListing.image_url ||
          sourceListing.photos ||
          sourceListing.listing_photos ||
          null,
        sourceListing.photo_variants || null
      )
        .map((variant, index) => {
          const url = getSelectedPhotoUrl(variant);
          if (!url) return null;
          return {
            ...variant,
            id:
              (typeof variant?.id === "string" && variant.id.trim()) ||
              url ||
              `image-${index + 1}`,
            url,
            is_cover: variant?.is_cover === true,
          };
        })
        .filter(Boolean);

  if (!derivedImages.length) {
    return {
      images: [],
      coverImage: null,
      coverImageUrl: null,
    };
  }

  const requestedCoverId =
    typeof sourceListing.cover_image_id === "string"
      ? sourceListing.cover_image_id.trim()
      : "";
  const coverIndex = requestedCoverId
    ? derivedImages.findIndex((image) => image?.id === requestedCoverId)
    : derivedImages.findIndex((image) => image?.is_cover === true);

  const orderedImages = [...derivedImages];
  if (coverIndex > 0) {
    const [coverImage] = orderedImages.splice(coverIndex, 1);
    orderedImages.unshift(coverImage);
  }

  return {
    images: orderedImages,
    coverImage: orderedImages[0] || null,
    coverImageUrl: orderedImages[0]?.url || null,
  };
}
