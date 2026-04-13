import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BusinessReviewsPanel from "@/components/publicBusinessProfile/BusinessReviewsPanel";

let viewerContext = {
  status: "authenticated",
  role: "business",
  user: null,
  profile: null,
  loading: false,
  isAuthenticated: true,
  isCustomer: false,
  isBusiness: true,
  isAdmin: false,
  isInternal: false,
};

const fetchMock = vi.fn();

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ supabase: null }),
}));

vi.mock("@/components/modals/ModalProvider", () => ({
  useModal: () => ({ openModal: vi.fn() }),
}));

vi.mock("@/components/public/ViewerContextEnhancer", () => ({
  useViewerContext: () => viewerContext,
}));

vi.mock("@/components/moderation/ReportModal", () => ({
  __esModule: true,
  default: () => null,
}));

const reviews = [
  {
    id: "review-1",
    business_id: "00000000-0000-0000-0000-000000000111",
    customer_id: "cust-1",
    rating: 5,
    title: "Loved it",
    body: "Great service",
    created_at: "2026-04-07T00:00:00.000Z",
    updated_at: null,
    business_reply: null,
    business_reply_at: null,
    author_profile: {
      user_id: "cust-1",
      display_name: "Reviewer One",
      avatar_url: null,
    },
  },
  {
    id: "review-2",
    business_id: "00000000-0000-0000-0000-000000000111",
    customer_id: "cust-2",
    rating: 4,
    title: "Solid",
    body: "Would come back",
    created_at: "2026-04-06T00:00:00.000Z",
    updated_at: null,
    business_reply: null,
    business_reply_at: null,
    author_profile: {
      user_id: "cust-2",
      display_name: "Reviewer Two",
      avatar_url: null,
    },
  },
];

describe("Business owner review controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  it("updates review count and rating summary after an owner deletes a review", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/business/reviews/")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            ratingSummary: {
              count: 1,
              average: 4,
              breakdown: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 },
            },
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          reviews: [reviews[1]],
        }),
      };
    });

    render(
      <BusinessReviewsPanel
        mode="owner"
        businessId="00000000-0000-0000-0000-000000000111"
        initialReviews={reviews}
        ratingSummary={{
          count: 2,
          average: 4.5,
          breakdown: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 },
        }}
        reviewCount={2}
      />
    );

    expect(screen.getByText("2 reviews")).toBeInTheDocument();
    expect(screen.getByText("4.5")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Delete review" })[0]);

    await waitFor(() => {
      expect(screen.getByText("1 review")).toBeInTheDocument();
      expect(screen.getByText("4.0")).toBeInTheDocument();
    });

    expect(fetchMock.mock.calls).toEqual(
      expect.arrayContaining([
        [
          "/api/business/reviews/review-1",
          expect.objectContaining({ method: "DELETE" }),
        ],
        [
          "/api/public-business-reviews?businessId=00000000-0000-0000-0000-000000000111&limit=2",
          expect.objectContaining({ credentials: "same-origin" }),
        ],
      ])
    );
  });

  it("shows owner reply controls and saves a reply inline", async () => {
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.startsWith("/api/business/reviews/") && options?.method === "PATCH") {
        return {
          ok: true,
          json: async () => ({
            success: true,
            review: {
              ...reviews[0],
              business_reply: "Thanks for the kind words.",
              business_reply_at: "2026-04-12T00:00:00.000Z",
            },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ reviews }),
      };
    });

    render(
      <BusinessReviewsPanel
        mode="owner"
        businessId="00000000-0000-0000-0000-000000000111"
        initialReviews={[reviews[0]]}
        ratingSummary={{
          count: 1,
          average: 5,
          breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 },
        }}
        reviewCount={1}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.change(screen.getByPlaceholderText("Write a reply"), {
      target: { value: "Thanks for the kind words." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post reply" }));

    await waitFor(() => {
      expect(screen.getByText("Thanks for the kind words.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Edit reply" })).toBeInTheDocument();
    });
  });
});
