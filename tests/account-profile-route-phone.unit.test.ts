import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/account/profile/route";

const { createSupabaseRouteHandlerClientMock } = vi.hoisted(() => ({
  createSupabaseRouteHandlerClientMock: vi.fn(),
}));

vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseRouteHandlerClient: createSupabaseRouteHandlerClientMock,
}));

function createRequest(body = {}) {
  return new Request("http://localhost:3000/api/account/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createSupabaseMock() {
  let usersUpdatePayload = null;

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1", email: "owner@example.com" } },
        error: null,
      }),
    },
    from: vi.fn((table) => {
      if (table !== "users") throw new Error(`Unexpected table: ${table}`);
      return {
        update: vi.fn((payload) => {
          usersUpdatePayload = payload;
          return {
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "user-1", ...payload },
                  error: null,
                }),
              })),
            })),
          };
        }),
      };
    }),
    get usersUpdatePayload() {
      return usersUpdatePayload;
    },
  };
}

describe("POST /api/account/profile phone normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates private user phone only", async () => {
    const supabase = createSupabaseMock();
    createSupabaseRouteHandlerClientMock.mockReturnValue(supabase);

    const response = await POST(createRequest({ phone: "562-123-4567" }));

    expect(response.status).toBe(200);
    expect(supabase.from).toHaveBeenCalledWith("users");
    expect(supabase.from).not.toHaveBeenCalledWith("businesses");
    expect(supabase.usersUpdatePayload).toEqual(
      expect.objectContaining({ phone: "(562) 123-4567" })
    );
  });

  it("rejects incomplete non-empty private phone values", async () => {
    const supabase = createSupabaseMock();
    createSupabaseRouteHandlerClientMock.mockReturnValue(supabase);

    const response = await POST(createRequest({ phone: "562" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Enter a complete 10-digit US phone number.",
    });
    expect(supabase.usersUpdatePayload).toBeNull();
  });

  it("allows empty private phone values", async () => {
    const supabase = createSupabaseMock();
    createSupabaseRouteHandlerClientMock.mockReturnValue(supabase);

    const response = await POST(createRequest({ phone: "" }));

    expect(response.status).toBe(200);
    expect(supabase.usersUpdatePayload).toEqual(expect.objectContaining({ phone: null }));
  });
});
