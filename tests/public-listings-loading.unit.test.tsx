import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLocationCacheKey } from "@/lib/location";

let searchParamsValue = "";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, prefetch: _prefetch, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/listings",
  useRouter: () => ({
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}));

vi.mock("@/components/location/LocationProvider", () => ({
  useLocation: () => ({
    location: { city: "Long Beach", region: "CA", lat: 33.7701, lng: -118.1937 },
    hydrated: true,
  }),
}));

vi.mock("@/components/SafeImage", () => ({
  __esModule: true,
  default: ({ alt, ...rest }: any) => <img alt={alt} {...rest} />,
}));

vi.mock("@/components/cart/CartProvider", () => ({
  useCart: () => ({
    addItem: vi.fn(async () => ({})),
  }),
}));

vi.mock("@/lib/listingPhotos", () => ({
  resolveListingCoverImageUrl: () => "/listing.jpg",
}));

vi.mock("@/lib/ids/publicRefs", () => ({
  getListingUrl: (listing: any) => `/listings/${listing.public_id || listing.id}`,
}));

import ListingsClient, {
  LoadingGridSkeleton,
} from "@/app/(public)/listings/ListingsClient";
import ListingMarketplaceCardSkeleton from "@/app/(public)/listings/components/ListingMarketplaceCardSkeleton";
import {
  LISTING_MARKETPLACE_CARD_CLASS,
  LISTING_MARKETPLACE_GRID_CLASS,
  LISTING_MARKETPLACE_IMAGE_FRAME_CLASS,
} from "@/app/(public)/listings/components/ListingMarketplaceCard";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("public listings loading states", () => {
  beforeEach(() => {
    searchParamsValue = "";
    sessionStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ listings: [] }),
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders skeleton cards with a visible image placeholder that matches tile framing", () => {
    render(
      <>
        <LoadingGridSkeleton />
        <ListingMarketplaceCardSkeleton />
      </>
    );

    expect(screen.getByTestId("listings-loading-grid")).toHaveClass(LISTING_MARKETPLACE_GRID_CLASS);
    expect(screen.getAllByTestId("listing-marketplace-card-skeleton").at(-1)).toHaveClass(
      LISTING_MARKETPLACE_CARD_CLASS
    );
    expect(screen.getAllByTestId("listing-marketplace-card-skeleton-image").at(-1)).toHaveClass(
      LISTING_MARKETPLACE_IMAGE_FRAME_CLASS
    );
    expect(screen.getAllByTestId("listing-marketplace-card-skeleton-price").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("listing-marketplace-card-skeleton-cta").length).toBeGreaterThan(0);
  });

  it("keeps the header and toolbar visible while the first listings request is loading", async () => {
    const pending = deferred<{ ok: boolean; json: () => Promise<{ listings: never[] }> }>();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));

    render(<ListingsClient />);

    expect(screen.getByText("Explore listings in Long Beach")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /filters/i })).toBeInTheDocument();
    expect(screen.getByTestId("listings-loading-grid")).toBeInTheDocument();
    expect(screen.getAllByTestId("listing-marketplace-card-skeleton-image").length).toBeGreaterThan(0);

    await act(async () => {
      pending.resolve({
        ok: true,
        json: async () => ({ listings: [] }),
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("listings-loading-grid")).not.toBeInTheDocument();
    });
  });

  it("preserves cached results during a same-query refresh instead of replacing them with blank cards", async () => {
    const pending = deferred<{ ok: boolean; json: () => Promise<{ listings: never[] }> }>();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));

    const cachedListing = {
      id: "listing-1",
      public_id: "listing-1",
      title: "Cached listing",
      price: 24,
      business_id: "business-1",
      business_name: "Barrio Shop",
      city: "Long Beach",
      inventory_status: "in_stock",
      inventory_quantity: 5,
    };

    const location = { city: "Long Beach", region: "CA", lat: 33.7701, lng: -118.1937 };
    const cacheKey = `${getLocationCacheKey(location)}::all::all`;
    sessionStorage.setItem(cacheKey, JSON.stringify([cachedListing]));

    render(<ListingsClient />);

    await waitFor(() => {
      expect(screen.getByText("Cached listing")).toBeInTheDocument();
    });

    expect(screen.getByTestId("listings-toolbar-loading-indicator")).toBeInTheDocument();
    expect(screen.queryByTestId("listings-loading-grid")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /cached listing/i })).toHaveAttribute(
      "href",
      "/listings/listing-1"
    );

    await act(async () => {
      pending.resolve({
        ok: true,
        json: async () => ({ listings: [] }),
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("listings-toolbar-loading-indicator")).not.toBeInTheDocument();
    });
  });
});
