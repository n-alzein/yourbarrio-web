import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getBusinessDataClientForRequestMock,
  getListingVariantsMock,
} = vi.hoisted(() => ({
  getBusinessDataClientForRequestMock: vi.fn(),
  getListingVariantsMock: vi.fn(async () => ({
    hasOptions: false,
    attributes: [],
    variants: [],
  })),
}));

vi.mock("@/lib/business/getBusinessDataClientForRequest", () => ({
  getBusinessDataClientForRequest: getBusinessDataClientForRequestMock,
}));

vi.mock("@/lib/listingOptions", () => ({
  getListingVariants: getListingVariantsMock,
}));

import { getOwnedListingPreviewData } from "@/lib/listingPreview";

function createPreviewClient({
  listings = [],
  businesses = [],
}: {
  listings?: Record<string, unknown>[];
  businesses?: Record<string, unknown>[];
}) {
  return {
    from: vi.fn((table: string) => {
      let rows = table === "listings" ? listings : table === "businesses" ? businesses : [];
      const filters: Array<{ field: string; value: unknown }> = [];

      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((field: string, value: unknown) => {
          filters.push({ field, value });
          return query;
        }),
        maybeSingle: vi.fn(async () => {
          const match =
            rows.find((row) =>
              filters.every(({ field, value }) => row?.[field as keyof typeof row] === value)
            ) || null;
          return { data: match, error: null };
        }),
      };

      return query;
    }),
  };
}

const previewPageSource = readFileSync(
  path.join(process.cwd(), "app/(business)/business/listings/[id]/preview/page.js"),
  "utf8"
);
const publicListingPageSource = readFileSync(
  path.join(process.cwd(), "app/(public)/listings/[id]/page.js"),
  "utf8"
);
const listingDetailsSource = readFileSync(
  path.join(process.cwd(), "app/(public)/listings/[id]/ListingDetailsClient.jsx"),
  "utf8"
);

describe("business listing preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies anonymous preview access through business auth", async () => {
    getBusinessDataClientForRequestMock.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });

    const result = await getOwnedListingPreviewData("listing-1");

    expect(result).toMatchObject({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
  });

  it("returns not found for non-owners", async () => {
    getBusinessDataClientForRequestMock.mockResolvedValue({
      ok: true,
      client: createPreviewClient({
        listings: [
          {
            id: "123e4567-e89b-42d3-a456-426614174000",
            business_id: "other-business",
            title: "Other listing",
          },
        ],
      }),
      effectiveUserId: "business-1",
    });

    const result = await getOwnedListingPreviewData("123e4567-e89b-42d3-a456-426614174000");

    expect(result).toMatchObject({
      ok: false,
      status: 404,
      error: "Not found",
    });
  });

  it("applies staged draft data for owner preview reads", async () => {
    getBusinessDataClientForRequestMock.mockResolvedValue({
      ok: true,
      client: createPreviewClient({
        listings: [
          {
            id: "123e4567-e89b-42d3-a456-426614174000",
            public_id: "abc123",
            business_id: "business-1",
            title: "Published title",
            price: 20,
            status: "published",
            has_unpublished_changes: true,
            draft_data: {
              title: "Draft preview title",
              cover_image_id: "photo-2",
              photo_variants: [
                {
                  id: "photo-1",
                  original: {
                    url: "https://example.com/photo-1.jpg",
                    path: "listing-photos/photo-1.jpg",
                  },
                  enhanced: null,
                  selectedVariant: "original",
                },
                {
                  id: "photo-2",
                  original: {
                    url: "https://example.com/photo-2.jpg",
                    path: "listing-photos/photo-2.jpg",
                  },
                  enhanced: null,
                  selectedVariant: "original",
                },
              ],
              photo_url: JSON.stringify([
                "https://example.com/photo-1.jpg",
                "https://example.com/photo-2.jpg",
              ]),
              listingOptions: {
                hasOptions: false,
                attributes: [],
                variants: [],
              },
            },
          },
        ],
        businesses: [
          {
            id: "business-row-1",
            owner_user_id: "business-1",
            public_id: "shop-1",
            business_name: "Barrio Shop",
            business_type: "retail",
            category: "Retail",
            city: "Los Angeles",
            pickup_enabled_default: true,
            local_delivery_enabled_default: false,
            default_delivery_fee_cents: null,
            delivery_radius_miles: null,
            delivery_min_order_cents: null,
            delivery_notes: null,
            hours_json: {},
            social_links_json: {},
            is_internal: false,
            verification_status: "pending",
            account_status: "active",
            deleted_at: null,
          },
        ],
      }),
      effectiveUserId: "business-1",
    });

    const result = await getOwnedListingPreviewData("123e4567-e89b-42d3-a456-426614174000");

    expect(result.ok).toBe(true);
    expect(result.listing).toMatchObject({
      id: "123e4567-e89b-42d3-a456-426614174000",
      title: "Draft preview title",
      cover_image_id: "photo-2",
      has_unpublished_changes: true,
    });
    expect(result.listing.images?.[0]).toMatchObject({
      id: "photo-2",
      url: "https://example.com/photo-2.jpg",
    });
    expect(result.business).toMatchObject({
      id: "business-1",
      business_name: "Barrio Shop",
    });
    expect(result.listingOptions).toMatchObject({
      hasOptions: false,
      attributes: [],
      variants: [],
    });
  });

  it("keeps preview banner and overlay wiring out of the normal public listing page", () => {
    expect(listingDetailsSource).toContain("Preview mode — this is how customers will see your listing after publishing.");
    expect(previewPageSource).toContain("previewBanner={{ editorHref, isFromEditorPreview }}");
    expect(previewPageSource).toContain("const isFromEditorPreview = resolvedSearchParams?.fromEditor === \"1\"");
    expect(previewPageSource).toContain("previewBanner={{ editorHref, isFromEditorPreview }}");
    expect(previewPageSource).toContain('redirect(`/business/login?next=${encodeURIComponent(previewPath)}`)');
    expect(publicListingPageSource).not.toContain("previewBanner");
    expect(listingDetailsSource).toContain('data-testid="listing-preview-banner"');
    expect(listingDetailsSource).toContain("resolveListingMedia(listing)");
    expect(listingDetailsSource).not.toContain("extractPhotoUrls(listing.photo_url)");
    expect(previewPageSource).not.toContain("backLabel=\"Back to editor\"");
    expect(previewPageSource).not.toContain("backHref={editorHref}");
    expect(listingDetailsSource).toContain("if (previewBanner?.isFromEditorPreview)");
    expect(listingDetailsSource).toContain("window.close()");
    expect(listingDetailsSource).toContain("setPreviewCloseHelp(\"You can close this preview tab and return to the editor.\")");
    expect(listingDetailsSource).toContain("window.location.href = previewBanner.editorHref");
    expect(listingDetailsSource).toContain('? "Close preview" : "Back to editor"');
    expect(listingDetailsSource).toContain("{!previewBanner ? (");
    expect(listingDetailsSource).toContain("useState(() => getInitialHeroSrc(initialListing))");
    expect(listingDetailsSource).toContain('stage: "client_before_render"');
  });
});
