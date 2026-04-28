import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let queryHandlers: Record<string, any> = {};
let reviewsPromiseFactory: (() => Promise<any[]>) | null = null;

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({
    from: (table: string) => ({
      select: () => {
        const handler = queryHandlers[table];
        if (!handler) {
          throw new Error(`Missing query handler for ${table}`);
        }
        return handler();
      },
    }),
  }),
}));

vi.mock("@/components/business/profile-system/ProfileSystem", () => ({
  __esModule: true,
  ProfilePageShell: ({ children }: any) => <div data-testid="profile-page-shell">{children}</div>,
}));

vi.mock("@/components/publicBusinessProfile/BusinessProfileView", () => ({
  __esModule: true,
  default: ({ profile, loading }: any) => (
    <div data-testid="business-profile-view" data-loading={String(loading)}>
      {profile?.business_name}
    </div>
  ),
}));

vi.mock("@/lib/ids/publicRefs", () => ({
  getBusinessPublicUrl: () => "/b/shop-111",
}));

vi.mock("@/lib/publicBusinessProfile/normalize", () => ({
  sanitizeAnnouncements: (value: any) => value || [],
  sanitizeGalleryPhotos: (value: any) => value || [],
  sanitizeListings: (value: any) => value || [],
  sanitizePublicProfile: (value: any) => value || null,
  sanitizeReviews: (value: any) => value || [],
}));

vi.mock("@/lib/pricing", () => ({
  withListingPricing: (value: any) => value,
}));

vi.mock("@/lib/publicBusinessProfile/reviews", () => ({
  fetchBusinessReviews: (...args: any[]) => {
    if (!reviewsPromiseFactory) {
      throw new Error(`Unexpected reviews fetch: ${JSON.stringify(args)}`);
    }
    return reviewsPromiseFactory();
  },
}));

import PublicBusinessPreviewClient from "@/components/publicBusinessProfile/PublicBusinessPreviewClient";
import PublicBusinessProfileSkeleton from "@/components/publicBusinessProfile/PublicBusinessProfileSkeleton";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createResolvedQuery(data: any) {
  const chain = {
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    or: () => chain,
    maybeSingle: async () => ({ data, error: null }),
    then: (resolve: any) => Promise.resolve(resolve({ data, error: null })),
  };
  return chain;
}

describe("public business profile loading states", () => {
  beforeEach(() => {
    sessionStorage.clear();
    queryHandlers = {
      businesses: () =>
        createResolvedQuery({
          id: "shop-111",
          owner_user_id: "shop-111",
          public_id: "shop-111",
          business_name: "Barrio Boutique",
          category: "Boutique",
          city: "Los Angeles",
          state: "CA",
        }),
      business_announcements: () => createResolvedQuery([]),
      business_gallery_photos: () => createResolvedQuery([]),
      listings: () => createResolvedQuery([]),
      business_reviews: () => createResolvedQuery([]),
    };
    reviewsPromiseFactory = async () => [];
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders a visible cover, avatar, hours, and listings skeleton aligned to the profile layout", () => {
    render(<PublicBusinessProfileSkeleton />);

    expect(screen.getByTestId("public-business-profile-skeleton-cover")).toHaveClass(
      "h-[205px]",
      "sm:h-[245px]",
      "lg:h-[270px]"
    );
    expect(screen.getByTestId("public-business-profile-skeleton-avatar")).toHaveClass(
      "h-20",
      "w-20",
      "sm:h-24",
      "sm:w-24"
    );
    expect(screen.getByTestId("public-business-profile-skeleton-nav")).toBeInTheDocument();
    expect(screen.getByTestId("public-business-profile-skeleton-hours")).toBeInTheDocument();
    expect(screen.getByTestId("public-business-profile-skeleton-listings")).toBeInTheDocument();
    expect(screen.getAllByTestId("public-business-profile-skeleton-listing-card").length).toBe(4);
  });

  it("keeps cached profile content visible during preview refreshes instead of replacing it with full skeletons", async () => {
    const reviewsDeferred = deferred<any[]>();
    reviewsPromiseFactory = () => reviewsDeferred.promise;
    sessionStorage.setItem(
      "yb_public_preview_shop-111",
      JSON.stringify({
        businessId: "shop-111",
        profile: {
          id: "shop-111",
          owner_user_id: "shop-111",
          public_id: "shop-111",
          business_name: "Barrio Boutique",
        },
        announcements: [],
        gallery: [],
        listings: [],
        reviews: [],
        ratingSummary: { count: 0, average: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
      })
    );

    render(<PublicBusinessPreviewClient businessId="shop-111" trackView={false} />);

    await waitFor(() => {
      expect(screen.getByTestId("business-profile-view")).toHaveTextContent("Barrio Boutique");
    });

    expect(screen.getByTestId("business-profile-view")).toHaveAttribute("data-loading", "true");
    expect(screen.getByTestId("public-business-profile-refresh-indicator")).toBeInTheDocument();
    expect(screen.queryByTestId("public-business-profile-skeleton")).not.toBeInTheDocument();

    await act(async () => {
      reviewsDeferred.resolve([]);
    });

    await waitFor(() => {
      expect(screen.getByTestId("business-profile-view")).toHaveAttribute("data-loading", "false");
    });
  });
});
