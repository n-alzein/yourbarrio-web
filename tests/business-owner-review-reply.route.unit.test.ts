import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/business/reviews/[id]/route";

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

describe("PATCH /api/business/reviews/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects reply attempts for reviews outside the authenticated owner's business", async () => {
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

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessReply: "Thanks!" }),
      }),
      { params: { id: "review-x" } }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Review not found" });
  });

  it("updates the business reply for an owned review", async () => {
    const reviewLookup = vi.fn().mockResolvedValue({
      data: { id: "review-1", business_id: "00000000-0000-0000-0000-000000000111" },
      error: null,
    });
    const updateReview = vi.fn().mockResolvedValue({
      data: {
        id: "review-1",
        business_id: "00000000-0000-0000-0000-000000000111",
        customer_id: "cust-1",
        rating: 5,
        title: "Great spot",
        body: "Loved it.",
        created_at: "2026-04-07T00:00:00.000Z",
        business_reply: "Thanks!",
        business_reply_at: "2026-04-12T00:00:00.000Z",
        updated_at: null,
      },
      error: null,
    });

    const client = {
      from: vi.fn((table: string) => {
        if (table !== "business_reviews") throw new Error(`Unexpected table: ${table}`);
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: reviewLookup,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: updateReview,
                })),
              })),
            })),
          })),
        };
      }),
    };

    getBusinessDataClientForRequestMock.mockResolvedValue(createAccess(client));

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessReply: "Thanks!" }),
      }),
      { params: Promise.resolve({ id: "review-1" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      review: expect.objectContaining({
        id: "review-1",
        business_reply: "Thanks!",
      }),
    });
  });
});
