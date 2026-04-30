import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ListingMarketplaceCard from "@/app/(public)/listings/components/ListingMarketplaceCard";
import {
  calculateCheckoutPricing,
  calculateListingPricing,
} from "@/lib/pricing";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, prefetch, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/components/SafeImage", () => ({
  __esModule: true,
  default: ({ alt, ...rest }) => <img alt={alt} {...rest} />,
}));

vi.mock("@/components/cart/CartProvider", () => ({
  useCart: () => ({
    addItem: vi.fn(async () => ({})),
  }),
}));

describe("pricing helpers", () => {
  it("computes standard all-in listing pricing from the base merchant price", () => {
    expect(calculateListingPricing(12.5)).toEqual({
      basePriceCents: 1250,
      platformFeeCents: 63,
      finalPriceCents: 1313,
    });
  });

  it("keeps zero-fee amounts unchanged", () => {
    expect(calculateListingPricing(0.01)).toEqual({
      basePriceCents: 1,
      platformFeeCents: 0,
      finalPriceCents: 1,
    });
  });

  it("uses stable cent rounding for low-price items", () => {
    expect(calculateListingPricing(0.05)).toEqual({
      basePriceCents: 5,
      platformFeeCents: 0,
      finalPriceCents: 5,
    });
  });

  it("applies the fee to the discounted base price passed by callers", () => {
    expect(calculateListingPricing(9.99)).toEqual({
      basePriceCents: 999,
      platformFeeCents: 50,
      finalPriceCents: 1049,
    });
  });

  it("keeps checkout all-in subtotal and total consistent with the same fee helper", () => {
    expect(
      calculateCheckoutPricing({
        subtotalCents: 2500,
        deliveryFeeCents: 300,
        taxCents: 0,
      })
    ).toEqual({
      baseSubtotalCents: 2500,
      platformFeeCents: 125,
      deliveryFeeCents: 300,
      subtotalBeforeTaxCents: 2925,
      taxCents: 0,
      totalCents: 2925,
    });
  });
});

describe("public listing all-in display", () => {
  it("renders the public tile price as final customer-facing price", () => {
    render(
      <ListingMarketplaceCard
        fallbackLocationLabel="Los Angeles"
        listing={{
          id: "listing-1",
          public_id: "abc123",
          title: "Salsa sampler",
          price: 10,
          priceCents: 1000,
          platformFeeCents: 50,
          finalPriceCents: 1050,
          business_id: "business-1",
          business_name: "Barrio Kitchen",
          city: "Los Angeles",
          photo_url: "/fallback.jpg",
          photo_variants: [
            { id: "photo-1", original: { url: "/fallback.jpg", path: null } },
            { id: "photo-2", original: { url: "/cover.jpg", path: null } },
          ],
          cover_image_id: "photo-2",
          inventory_status: "in_stock",
          inventory_quantity: 5,
        }}
      />
    );

    expect(screen.getByText("$10.50")).toBeInTheDocument();
    expect(screen.queryByText("$10.00")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Salsa sampler" })).toHaveAttribute(
      "src",
      "/cover.jpg"
    );
  });
});
