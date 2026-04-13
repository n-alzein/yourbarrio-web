import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BusinessProfileView from "@/components/publicBusinessProfile/BusinessProfileView";

let viewerContext = {
  status: "guest",
  role: null,
  user: null,
  profile: null,
  loading: false,
  isAuthenticated: false,
  isCustomer: false,
  isBusiness: false,
  isAdmin: false,
  isInternal: false,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/b/shop-111",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({
    user: null,
    role: null,
    supabase: null,
  }),
}));

vi.mock("@/components/modals/ModalProvider", () => ({
  useModal: () => ({ openModal: vi.fn() }),
}));

vi.mock("@/components/public/ViewerContextEnhancer", () => ({
  ViewerContextEnhancer: ({ children }) => children,
  useViewerContext: () => viewerContext,
  __esModule: true,
  default: ({ children }) => children,
}));

vi.mock("@/components/moderation/ReportModal", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("@/components/FastImage", () => ({
  __esModule: true,
  default: ({ alt, ...rest }) => <img alt={alt} {...rest} />,
}));

const baseProps = {
  profile: {
    id: "00000000-0000-0000-0000-000000000111",
    owner_user_id: "00000000-0000-0000-0000-000000000111",
    public_id: "shop-111",
    business_name: "Barrio Boutique",
    business_type: "boutique",
    category: "Boutique",
    city: "Los Angeles",
    state: "CA",
    description: "Neighborhood boutique.",
    phone: "5551234567",
    website: "barrioboutique.com",
  },
  businessId: "00000000-0000-0000-0000-000000000111",
  publicPath: "/b/shop-111",
  ratingSummary: { count: 1, average: 5, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 } },
  listings: [],
  reviews: [
    {
      id: "review-1",
      business_id: "00000000-0000-0000-0000-000000000111",
      customer_id: "cust-1",
      rating: 5,
      title: "Great spot",
      body: "Loved it.",
      created_at: "2026-04-07T00:00:00.000Z",
      updated_at: null,
      business_reply: "Thanks for stopping by.",
      business_reply_at: "2026-04-08T00:00:00.000Z",
      author_profile: {
        user_id: "cust-1",
        display_name: "Reviewer One",
        avatar_url: null,
      },
    },
  ],
  announcements: [],
  gallery: [
    { id: "photo-1", photo_url: "https://example.com/p1.jpg", caption: "Photo one" },
    { id: "photo-2", photo_url: "https://example.com/p2.jpg", caption: "Photo two" },
  ],
};

describe("BusinessProfileView", () => {
  beforeEach(() => {
    viewerContext = {
      status: "guest",
      role: null,
      user: null,
      profile: null,
      loading: false,
      isAuthenticated: false,
      isCustomer: false,
      isBusiness: false,
      isAdmin: false,
      isInternal: false,
    };
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
        ok: false,
        json: async () => ({ reviews: [] }),
      }))
    );
  });

  it("renders the shared canonical sections in public mode without owner controls", () => {
    render(<BusinessProfileView mode="public" {...baseProps} />);

    expect(screen.getByRole("heading", { name: "About" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Listings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reviews" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Updates" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gallery" })).toBeInTheDocument();
    expect(screen.getByText("Thanks for stopping by.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete review" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reply" })).not.toBeInTheDocument();
    expect(screen.getAllByAltText(/Photo (one|two)/i)).toHaveLength(2);
  });

  it("renders owner controls on top of the same shared profile view", () => {
    viewerContext = {
      status: "authenticated",
      role: "business",
      user: { id: "00000000-0000-0000-0000-000000000111" },
      profile: null,
      loading: false,
      isAuthenticated: true,
      isCustomer: false,
      isBusiness: true,
      isAdmin: false,
      isInternal: false,
    };

    render(
      <BusinessProfileView
        mode="owner"
        {...baseProps}
        heroProps={{
          ownerPrimaryAction: {
            label: "Edit profile",
            onClick: vi.fn(),
          },
        }}
        galleryTileActions={(photo) => (
          <button type="button">Delete {photo.id}</button>
        )}
      />
    );

    expect(screen.getByRole("button", { name: "Edit profile" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete review" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit reply" })).toBeInTheDocument();
    expect(screen.getByText("Thanks for stopping by.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "About" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reviews" })).toBeInTheDocument();
    expect(screen.getAllByAltText(/Photo (one|two)/i)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Delete photo-1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete photo-2" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Gallery" })).toHaveLength(1);
  });
});
