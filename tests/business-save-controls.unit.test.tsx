import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NearbyBusinessCard from "@/app/(customer)/customer/nearby/_components/NearbyBusinessCard";
import BusinessProfileView from "@/components/publicBusinessProfile/BusinessProfileView";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/b/shop-111",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "business-user" },
    role: "business",
    supabase: null,
  }),
}));

vi.mock("@/components/modals/ModalProvider", () => ({
  useModal: () => ({ openModal: vi.fn() }),
}));

vi.mock("@/components/public/ViewerContextEnhancer", () => ({
  ViewerContextEnhancer: ({ children }: any) => children,
  useViewerContext: () => ({
    status: "authenticated",
    role: "business",
    user: { id: "business-user" },
    loading: false,
    isAuthenticated: true,
    isCustomer: false,
    isBusiness: true,
    isAdmin: false,
    isInternal: false,
  }),
  __esModule: true,
  default: ({ children }: any) => children,
}));

vi.mock("@/components/moderation/ReportModal", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("@/components/FastImage", () => ({
  __esModule: true,
  default: ({ alt, fallbackSrc, fill, priority, ...rest }: any) => <img alt={alt} {...rest} />,
}));

const listingDetailsSource = readFileSync(
  path.join(process.cwd(), "app/(public)/listings/[id]/ListingDetailsClient.jsx"),
  "utf8"
);

const migrationSource = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260420113000_block_business_saves.sql"),
  "utf8"
);

const profileProps = {
  profile: {
    id: "business-user",
    owner_user_id: "business-user",
    public_id: "shop-111",
    business_name: "Barrio Boutique",
    business_type: "boutique",
    category: "Boutique",
    city: "Los Angeles",
    state: "CA",
    description: "Neighborhood boutique.",
  },
  businessId: "business-user",
  publicPath: "/b/shop-111",
  ratingSummary: { count: 0, average: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
  listings: [],
  reviews: [],
  announcements: [],
  gallery: [],
};

describe("business user save controls", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "IntersectionObserver",
      vi.fn(() => ({
        observe: vi.fn(),
        disconnect: vi.fn(),
        unobserve: vi.fn(),
      }))
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ reviews: [] }),
      }))
    );
  });

  it("does not render the save button on nearby business cards for business users", () => {
    render(
      <NearbyBusinessCard
        business={{ id: "shop-1", name: "Shop One", category: "Retail" }}
        onHover={vi.fn()}
        onLeave={vi.fn()}
        onClick={vi.fn()}
        registerCard={vi.fn()}
        showSaveControl={false}
      />
    );

    expect(screen.queryByRole("button", { name: /save shop/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open shop one profile/i })).toBeInTheDocument();
  });

  it("still renders save controls on nearby cards when allowed", () => {
    render(
      <NearbyBusinessCard
        business={{ id: "shop-1", name: "Shop One", category: "Retail" }}
        onHover={vi.fn()}
        onLeave={vi.fn()}
        onClick={vi.fn()}
        registerCard={vi.fn()}
        showSaveControl
      />
    );

    expect(screen.getByRole("button", { name: /save shop/i })).toBeInTheDocument();
  });

  it("does not render save controls on business profile pages", () => {
    render(<BusinessProfileView mode="public" {...profileProps} />);

    expect(screen.queryByRole("button", { name: /save shop/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "About" })).toBeInTheDocument();
  });

  it("guards listing detail save controls behind the business-aware visibility flag", () => {
    expect(listingDetailsSource).toContain(
      "const showSaveControls = !accountContext.isBusiness && !accountContext.rolePending"
    );
    expect(listingDetailsSource).toContain("{showSaveControls ? (");
    expect(listingDetailsSource).toContain('aria-label={isSaved ? "Unsave listing" : "Save listing"}');
    expect(listingDetailsSource).toContain("if (accountContext.isBusiness || accountContext.rolePending) return;");
  });

  it("blocks business roles from saved listing and business RLS mutations", () => {
    expect(migrationSource).toContain('COALESCE(users.role, \'\') <> \'business\'');
    expect(migrationSource).toContain('ON public.saved_listings FOR INSERT');
    expect(migrationSource).toContain('ON public.saved_listings FOR DELETE');
    expect(migrationSource).toContain('ON public.saved_businesses FOR INSERT');
    expect(migrationSource).toContain('ON public.saved_businesses FOR DELETE');
  });
});
