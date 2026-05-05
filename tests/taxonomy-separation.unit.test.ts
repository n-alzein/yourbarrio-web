import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildBusinessTaxonomyPayload,
  buildListingTaxonomyPayload,
} from "@/lib/taxonomy/compat";

const nearbySource = readFileSync(
  path.join(process.cwd(), "app/(customer)/customer/nearby/NearbyBusinessesClient.jsx"),
  "utf8"
);
const publicBusinessesSource = readFileSync(
  path.join(process.cwd(), "app/api/public-businesses/route.js"),
  "utf8"
);
const newListingSource = readFileSync(
  path.join(process.cwd(), "app/(business)/business/listings/new/page.jsx"),
  "utf8"
);
const editListingSource = readFileSync(
  path.join(process.cwd(), "app/(business)/business/listings/[id]/edit/page.js"),
  "utf8"
);
const businessOnboardingSource = readFileSync(
  path.join(process.cwd(), "app/api/businesses/route.js"),
  "utf8"
);
const businessProfileSource = readFileSync(
  path.join(process.cwd(), "app/api/business/profile/route.js"),
  "utf8"
);

describe("taxonomy separation", () => {
  it("keeps business and listing taxonomy payloads distinct while preserving legacy strings", () => {
    expect(buildBusinessTaxonomyPayload({ business_type: "Boutique" })).toMatchObject({
      business_type: "boutique",
      category: "Boutique",
      businessTypeSlug: "boutique",
      businessTypeName: "Boutique",
    });
    expect(buildListingTaxonomyPayload({ listing_category: "Clothing" })).toMatchObject({
      listing_category: "Clothing & Fashion",
      category: "clothing-fashion",
      listingCategorySlug: "clothing-fashion",
      listingCategoryName: "Clothing & Fashion",
    });
  });

  it("nearby consumes businessTypes and filters by business type fields", () => {
    expect(nearbySource).toContain("payload?.businessTypes");
    expect(nearbySource).toContain("businessTypeFilter");
    expect(nearbySource).toContain("businessTypeSlug");
    expect(nearbySource).toContain("All shops");
    expect(nearbySource).not.toContain("business_category_id");
    expect(nearbySource).not.toContain("All categories");
  });

  it("/api/public-businesses uses business_types and not public.business_categories", () => {
    expect(publicBusinessesSource).toContain('.from("business_types")');
    expect(publicBusinessesSource).toContain("businessTypes:");
    expect(publicBusinessesSource).not.toContain('.from("business_categories")');
  });

  it("listing create/edit writes listing_category_id while keeping legacy fields", () => {
    expect(newListingSource).toContain("fetchListingCategoryBySlug");
    expect(newListingSource).toContain("listing_category_id: listingCategory?.id || null");
    expect(newListingSource).toContain("listing_category:");
    expect(newListingSource).toContain("category:");

    expect(editListingSource).toContain("fetchListingCategoryBySlug");
    expect(editListingSource).toContain("listing_category_id: resolvedTaxonomy.listing_category_id");
    expect(editListingSource).toContain("buildListingDraftData({");
  });

  it("business onboarding/profile writes business_type_id while keeping legacy fields", () => {
    expect(businessOnboardingSource).toContain("fetchBusinessTypeBySlug");
    expect(businessOnboardingSource).toContain("business_type_id: businessType?.id || null");
    expect(businessOnboardingSource).toContain("business_type:");
    expect(businessOnboardingSource).toContain("category:");

    expect(businessProfileSource).toContain("fetchBusinessTypeBySlug");
    expect(businessProfileSource).toContain("business_type_id: businessType?.id || null");
  });
});
