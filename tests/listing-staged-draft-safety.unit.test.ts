import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const homeListingsSource = readFileSync(
  path.join(process.cwd(), "app/api/home-listings/route.js"),
  "utf8"
);
const searchSource = readFileSync(
  path.join(process.cwd(), "app/api/search/route.js"),
  "utf8"
);
const publicListingDetailsSource = readFileSync(
  path.join(process.cwd(), "app/(public)/listings/[id]/ListingDetailsClient.jsx"),
  "utf8"
);
const customerListingRouteSource = readFileSync(
  path.join(process.cwd(), "app/api/customer/listings/route.js"),
  "utf8"
);
const publicCategorySource = readFileSync(
  path.join(process.cwd(), "app/(public)/categories/[slug]/page.tsx"),
  "utf8"
);
const customerCategorySource = readFileSync(
  path.join(process.cwd(), "app/(customer)/category/[slug]/page.js"),
  "utf8"
);
const categoryListingsCachedSource = readFileSync(
  path.join(process.cwd(), "lib/categoryListingsCached.ts"),
  "utf8"
);
const publicBusinessProfileSource = readFileSync(
  path.join(process.cwd(), "app/(public)/(marketing)/b/[id]/page.jsx"),
  "utf8"
);
const cartRouteSource = readFileSync(
  path.join(process.cwd(), "app/api/cart/route.js"),
  "utf8"
);
const ordersRouteSource = readFileSync(
  path.join(process.cwd(), "app/api/orders/route.js"),
  "utf8"
);
const ownerBusinessListingsRouteSource = readFileSync(
  path.join(process.cwd(), "app/api/business/listings/route.js"),
  "utf8"
);

describe("staged listing draft safety", () => {
  it("keeps public and customer listing surfaces on public_listings_v without draft overlays", () => {
    expect(homeListingsSource).toContain('.from("public_listings_v")');
    expect(homeListingsSource).not.toContain("applyListingDraftDataToListing");

    expect(searchSource).toContain('.from("public_listings_v")');
    expect(searchSource).not.toContain("applyListingDraftDataToListing");

    expect(publicListingDetailsSource).toContain('.from("public_listings_v")');
    expect(publicListingDetailsSource).not.toContain("applyListingDraftDataToListing");

    expect(customerListingRouteSource).toContain('.from("public_listings_v")');
    expect(customerListingRouteSource).not.toContain("applyListingDraftDataToListing");

    expect(publicCategorySource).toContain("getCategoryListingsCached");
    expect(publicCategorySource).not.toContain("applyListingDraftDataToListing");
    expect(categoryListingsCachedSource).toContain('.from("public_listings_v")');
    expect(categoryListingsCachedSource).not.toContain("applyListingDraftDataToListing");

    expect(customerCategorySource).toContain('.from("public_listings_v")');
    expect(customerCategorySource).not.toContain("applyListingDraftDataToListing");

    expect(publicBusinessProfileSource).toContain('.from("public_listings_v")');
    expect(publicBusinessProfileSource).not.toContain("applyListingDraftDataToListing");
  });

  it("limits staged draft overlay application to the owner business listings API", () => {
    expect(ownerBusinessListingsRouteSource).toContain("applyListingDraftDataToListing");
    expect(ownerBusinessListingsRouteSource).toContain("data.has_unpublished_changes === true");
  });

  it("keeps cart and order previews on explicit operational listing fields only", () => {
    expect(cartRouteSource).not.toContain("draft_data");
    expect(cartRouteSource).not.toContain("has_unpublished_changes");
    expect(cartRouteSource).not.toContain("applyListingDraftDataToListing");

    expect(ordersRouteSource).not.toContain("draft_data");
    expect(ordersRouteSource).not.toContain("has_unpublished_changes");
    expect(ordersRouteSource).not.toContain("applyListingDraftDataToListing");
  });
});
