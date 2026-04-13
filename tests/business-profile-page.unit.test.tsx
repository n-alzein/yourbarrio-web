import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BusinessProfilePage from "@/components/business/profile/BusinessProfilePage";

const businessProfileViewMock = vi.fn(({ mode }) => (
  <div data-testid="shared-business-profile-view">{mode}</div>
));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({
    supabase: null,
    user: { id: "00000000-0000-0000-0000-000000000111" },
    profile: null,
    refreshProfile: vi.fn(),
  }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({
    from: vi.fn(),
    storage: {},
  }),
}));

vi.mock("@/lib/storageUpload", () => ({
  uploadPublicImage: vi.fn(),
}));

vi.mock("@/lib/ids/publicRefs", () => ({
  getBusinessPublicUrl: () => "/b/shop-111",
}));

vi.mock("@/components/business/profile-system/ProfileSystem", () => ({
  ProfilePageShell: ({ children }) => <div>{children}</div>,
}));

vi.mock("@/components/publicBusinessProfile/BusinessProfileView", () => ({
  __esModule: true,
  default: (props) => businessProfileViewMock(props),
}));

vi.mock("@/components/business/profile/OverviewEditor", () => ({
  __esModule: true,
  default: () => <div>Overview editor</div>,
}));

vi.mock("@/components/business/profile/GalleryManager", () => ({
  __esModule: true,
  default: () => <div>Gallery manager</div>,
}));

vi.mock("@/components/business/profile/AnnouncementsManager", () => ({
  __esModule: true,
  default: () => <div>Announcements manager</div>,
}));

describe("BusinessProfilePage", () => {
  it("renders the shared canonical profile view in owner mode", () => {
    render(
      <BusinessProfilePage
        initialProfile={{
          id: "00000000-0000-0000-0000-000000000111",
          business_name: "Barrio Boutique",
        }}
        initialGallery={[]}
        initialReviews={[]}
        initialListings={[]}
        initialAnnouncements={[]}
        ratingSummary={{ count: 0, average: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }}
      />
    );

    expect(screen.getByTestId("shared-business-profile-view")).toHaveTextContent("owner");
    expect(businessProfileViewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "owner",
      })
    );
  });
});
