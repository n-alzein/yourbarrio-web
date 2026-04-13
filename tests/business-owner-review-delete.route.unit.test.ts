import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "@/app/api/business/reviews/[id]/route";

const { getBusinessDataClientForRequestMock } = vi.hoisted(() => ({
  getBusinessDataClientForRequestMock: vi.fn(),
}));

vi.mock("@/lib/business/getBusinessDataClientForRequest", () => ({
  getBusinessDataClientForRequest: getBusinessDataClientForRequestMock,
}));

function createAccess(client: any) {
  return {
    ok: true,
    client,
    effectiveUserId: "00000000-0000-0000-0000-000000000111",
  };
}

describe("DELETE /api/business/reviews/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects deletion attempts for reviews outside the authenticated owner's business", async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
          })),
        })),
      })),
    };
    getBusinessDataClientForRequestMock.mockResolvedValue(createAccess(client));

    const response = await DELETE(new Request("http://localhost"), {
      params: { id: "review-x" },
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Review not found" });
  });

  it("deletes an owned review and returns the refreshed rating summary", async () => {
    const reviewLookup = vi.fn().mockResolvedValue({
      data: { id: "review-1", business_id: "00000000-0000-0000-0000-000000000111" },
      error: null,
    });
    const deleteReview = vi.fn().mockResolvedValue({
      data: { id: "review-1" },
      error: null,
    });
    const refreshRatings = vi.fn().mockResolvedValue({
      data: [{ rating: 4 }],
      error: null,
    });

    const client = {
      from: vi.fn((table: string) => {
        if (table !== "business_reviews") {
          throw new Error(`Unexpected table: ${table}`);
        }
        return {
          select: vi.fn((selection: string) => {
            if (selection === "id,business_id") {
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: reviewLookup,
                  })),
                })),
              };
            }

            if (selection === "rating") {
              return {
                eq: refreshRatings,
              };
            }

            throw new Error(`Unexpected selection: ${selection}`);
          }),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: deleteReview,
                })),
              })),
            })),
          })),
        };
      }),
    };

    getBusinessDataClientForRequestMock.mockResolvedValue(createAccess(client));

    const response = await DELETE(new Request("http://localhost"), {
      params: { id: "review-1" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      deletedReviewId: "review-1",
      ratingSummary: {
        count: 1,
        average: 4,
        breakdown: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 },
      },
    });
  });
});
