import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, ...rest }: any) => <img alt={alt} {...rest} />,
}));

vi.mock("@/lib/listingPhotos", () => ({
  resolveListingCoverImageUrl: () => null,
}));

vi.mock("@/lib/taxonomy/placeholders", () => ({
  getListingCategoryPlaceholder: () => "/placeholder.png",
}));

vi.mock("@/lib/ids/publicRefs", () => ({
  getCustomerListingUrl: (listing: any) => `/customer/listings/${listing.public_id || listing.id}`,
  getListingUrl: (listing: any) => `/listings/${listing.public_id || listing.id}`,
}));

vi.mock("@/components/location/LocationProvider", () => ({
  useLocation: () => ({
    location: { city: "Long Beach", region: "CA", lat: 33.7701, lng: -118.1937 },
    hydrated: true,
  }),
}));

vi.mock("@/components/cards/BusinessCard", () => ({
  __esModule: true,
  default: ({ business }: any) => <div>{business.business_name}</div>,
}));

import TrendingListingsSection from "@/components/home/TrendingListingsSection";
import PopularNearYouSection from "@/components/home/PopularNearYouSection";

const customerHomeSource = readFileSync(
  path.join(process.cwd(), "app/(customer)/customer/home/CustomerHomeClient.jsx"),
  "utf8"
);
function makeListings(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `listing-${index + 1}`,
    public_id: `listing-${index + 1}`,
    title: `Listing ${index + 1}`,
    price: 20 + index,
    category: "Clothing & Fashion",
    category_id: null,
    city: "Long Beach",
    business_id: `business-${index + 1}`,
    business_name: `Shop ${index + 1}`,
    created_at: `2026-04-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
    inventory_status: "in_stock",
    inventory_quantity: 5,
    low_stock_threshold: 2,
    inventory_last_updated_at: "2026-04-26T12:00:00.000Z",
  }));
}

describe("homepage launch focus", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          businesses: [
            { public_id: "business-1", business_name: "Shop One", verification_status: "auto_verified" },
            { public_id: "business-2", business_name: "Shop Two", verification_status: "auto_verified" },
          ],
        }),
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("uses the low-inventory listing title when few listings are available", () => {
    render(<TrendingListingsSection listings={makeListings(5)} city="Long Beach" />);

    expect(screen.getByText("Discover")).toBeInTheDocument();
    expect(screen.getByText("Recently added in Long Beach")).toBeInTheDocument();
    expect(screen.getByText("Local items available near you")).toBeInTheDocument();
  });

  it("switches to the popular title before the catalog is deep enough to trend", () => {
    render(<TrendingListingsSection listings={makeListings(10)} city="Long Beach" />);

    expect(screen.getByText("Popular in Long Beach")).toBeInTheDocument();
  });

  it("caps the home listings grid at two desktop rows worth of cards", () => {
    render(<TrendingListingsSection listings={makeListings(24)} city="Long Beach" limit={8} />);

    expect(screen.getByText("Popular in Long Beach")).toBeInTheDocument();
    expect(screen.getByTestId("homepage-listings-grid")).toBeInTheDocument();
    expect(screen.getAllByRole("link").filter((node) => node.getAttribute("href")?.startsWith("/listings/"))).toHaveLength(8);
  });

  it("keeps the homepage business title launch-appropriate", async () => {
    render(
      <PopularNearYouSection
        title="Local shops in Long Beach"
        limit={6}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Local shops in Long Beach")).toBeInTheDocument();
    });
  });

  it("removes the category section from the homepage client", () => {
    expect(customerHomeSource).not.toContain("Browse by category");
    expect(customerHomeSource).not.toContain("CategoryTilesGrid");
  });

  it("keeps the business section copy aligned to the launch brief", async () => {
    render(
      <PopularNearYouSection
        title="Local shops in Long Beach"
        subtitle="Verified local shops and storefronts around Long Beach"
        limit={6}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Local shops in Long Beach")).toBeInTheDocument();
    });

    expect(screen.getByText("Verified local shops and storefronts around Long Beach")).toBeInTheDocument();
  });
});
