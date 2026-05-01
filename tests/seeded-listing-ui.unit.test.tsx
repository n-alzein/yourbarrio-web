import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const listingDetailsSource = readFileSync(
  path.join(process.cwd(), "app/(public)/listings/[id]/ListingDetailsClient.jsx"),
  "utf8"
);

vi.mock("@/components/cart/CartProvider", () => ({
  useCart: () => ({
    addItem: vi.fn(),
    items: [],
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/components/SafeImage", () => ({
  default: (props: any) => <img alt={props.alt} />,
}));

vi.mock("@/lib/listingPhotos", () => ({
  resolveListingCoverImageUrl: () => null,
}));

vi.mock("@/lib/ids/publicRefs", () => ({
  getListingUrl: () => "/listings/listing-1",
}));

import ListingMarketplaceCard from "@/app/(public)/listings/components/ListingMarketplaceCard";

describe("seeded listing public UI", () => {
  it("shows a coming soon card state for seeded listings", () => {
    render(
      <ListingMarketplaceCard
        listing={{
          id: "listing-1",
          title: "Preview item",
          price: 12,
          business_id: "business-1",
          business_name: "Preview shop",
          city: "Long Beach",
          is_seeded: true,
          inventory_status: "in_stock",
          inventory_quantity: 5,
        }}
        fallbackLocationLabel="Long Beach"
      />
    );

    expect(screen.getAllByText("Coming soon").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /coming soon/i })).toBeDisabled();
  });

  it("keeps the seeded detail page in preview mode", () => {
    expect(listingDetailsSource).toContain("SEEDED_LISTING_PREVIEW_MESSAGE");
    expect(listingDetailsSource).toContain('seededListing ? "Coming soon"');
    expect(listingDetailsSource).toContain("!seededListing ? (");
  });
});
