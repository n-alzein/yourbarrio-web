import { describe, expect, it } from "vitest";
import {
  getSelectedPhotoUrl,
  resolveListingCoverImage,
  resolveListingCoverImageUrl,
} from "@/lib/listingPhotos";
import { resolveListingMedia } from "@/lib/resolveListingMedia";

describe("listing cover resolution", () => {
  it("returns the explicitly selected cover image when cover_image_id matches", () => {
    const listing = {
      cover_image_id: "photo-2",
      photo_variants: [
        {
          id: "photo-1",
          original: { url: "https://example.com/photo-1.jpg", path: "listing-photos/photo-1.jpg" },
          enhanced: null,
          selectedVariant: "original",
        },
        {
          id: "photo-2",
          original: { url: "https://example.com/photo-2.jpg", path: "listing-photos/photo-2.jpg" },
          enhanced: null,
          selectedVariant: "original",
        },
      ],
      photo_url: JSON.stringify([
        "https://example.com/photo-1.jpg",
        "https://example.com/photo-2.jpg",
      ]),
    };

    const cover = resolveListingCoverImage(listing);
    expect(cover?.id).toBe("photo-2");
    expect(getSelectedPhotoUrl(cover)).toBe("https://example.com/photo-2.jpg");
    expect(resolveListingCoverImageUrl(listing)).toBe("https://example.com/photo-2.jpg");
  });

  it("falls back to the first image when cover_image_id is missing", () => {
    const listing = {
      photo_variants: [
        {
          id: "photo-1",
          original: { url: "https://example.com/photo-1.jpg", path: "listing-photos/photo-1.jpg" },
          enhanced: null,
          selectedVariant: "original",
        },
        {
          id: "photo-2",
          original: { url: "https://example.com/photo-2.jpg", path: "listing-photos/photo-2.jpg" },
          enhanced: null,
          selectedVariant: "original",
        },
      ],
      photo_url: JSON.stringify([
        "https://example.com/photo-1.jpg",
        "https://example.com/photo-2.jpg",
      ]),
    };

    expect(resolveListingCoverImage(listing)?.id).toBe("photo-1");
    expect(resolveListingCoverImageUrl(listing)).toBe("https://example.com/photo-1.jpg");
  });

  it("orders resolved media with the selected draft cover first", () => {
    const listing = {
      cover_image_id: "photo-2",
      draft_data: {
        cover_image_id: "photo-3",
        photo_variants: [
          {
            id: "photo-1",
            original: { url: "https://example.com/photo-1.jpg", path: "listing-photos/photo-1.jpg" },
            enhanced: null,
            selectedVariant: "original",
          },
          {
            id: "photo-2",
            original: { url: "https://example.com/photo-2.jpg", path: "listing-photos/photo-2.jpg" },
            enhanced: null,
            selectedVariant: "original",
          },
          {
            id: "photo-3",
            original: { url: "https://example.com/photo-3.jpg", path: "listing-photos/photo-3.jpg" },
            enhanced: null,
            selectedVariant: "original",
          },
        ],
        photo_url: JSON.stringify([
          "https://example.com/photo-1.jpg",
          "https://example.com/photo-2.jpg",
          "https://example.com/photo-3.jpg",
        ]),
      },
      photo_variants: [
        {
          id: "photo-1",
          original: { url: "https://example.com/photo-1.jpg", path: "listing-photos/photo-1.jpg" },
          enhanced: null,
          selectedVariant: "original",
        },
      ],
      photo_url: JSON.stringify(["https://example.com/photo-1.jpg"]),
    };

    const media = resolveListingMedia(listing);

    expect(media.coverImage?.id).toBe("photo-3");
    expect(media.coverImageUrl).toBe("https://example.com/photo-3.jpg");
    expect(media.images.map((image) => image.id)).toEqual(["photo-3", "photo-1", "photo-2"]);
  });

  it("uses explicit images when provided and only falls back to placeholder when none exist", () => {
    const media = resolveListingMedia({
      images: [
        { id: "photo-2", url: "https://example.com/photo-2.jpg" },
        { id: "photo-1", url: "https://example.com/photo-1.jpg", is_cover: true },
      ],
    });

    expect(media.coverImage?.id).toBe("photo-1");
    expect(media.images[0]?.url).toBe("https://example.com/photo-1.jpg");
    expect(media.images).toHaveLength(2);
  });

  it("prefers explicit original or enhanced asset URLs over a generic image.url when present", () => {
    const media = resolveListingMedia({
      images: [
        {
          id: "photo-1",
          url: "https://example.com/cropped-square.jpg",
          original: { url: "https://example.com/full-original.jpg" },
          is_cover: true,
        },
        {
          id: "photo-2",
          url: "https://example.com/cropped-enhanced-square.jpg",
          original: { url: "https://example.com/full-original-2.jpg" },
          enhanced: { url: "https://example.com/full-enhanced-2.jpg" },
          selectedVariant: "enhanced",
        },
      ],
    });

    expect(media.coverImageUrl).toBe("https://example.com/full-original.jpg");
    expect(media.images.map((image) => image.url)).toEqual([
      "https://example.com/full-original.jpg",
      "https://example.com/full-enhanced-2.jpg",
    ]);
  });

  it("supports draft photo arrays under the photos field used by some editor-shaped payloads", () => {
    const media = resolveListingMedia({
      photo_url: JSON.stringify(["https://example.com/base.jpg"]),
      draft_data: {
        cover_image_id: "photo-2",
        photos: [
          {
            id: "photo-1",
            original: { url: "https://example.com/photo-1.jpg" },
          },
          {
            id: "photo-2",
            original: { url: "https://example.com/photo-2.jpg" },
          },
        ],
      },
    });

    expect(media.coverImage?.id).toBe("photo-2");
    expect(media.coverImageUrl).toBe("https://example.com/photo-2.jpg");
    expect(media.images.map((image) => image.id)).toEqual(["photo-2", "photo-1"]);
  });

  it("supports related listing_images rows and image_url fallback fields", () => {
    const media = resolveListingMedia({
      cover_image_id: "photo-2",
      listing_images: [
        { id: "photo-1", image_url: "https://example.com/photo-1.jpg" },
        { id: "photo-2", public_url: "https://example.com/photo-2.jpg" },
      ],
    });

    expect(media.coverImage?.id).toBe("photo-2");
    expect(media.coverImageUrl).toBe("https://example.com/photo-2.jpg");
    expect(media.images.map((image) => image.id)).toEqual(["photo-2", "photo-1"]);
  });
});
