import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/business-magic-link/route";

const { generateLinkMock, resendSendMock } = vi.hoisted(() => ({
  generateLinkMock: vi.fn(),
  resendSendMock: vi.fn(),
}));

vi.mock("@/lib/auth/supabaseAdmin", () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        generateLink: generateLinkMock,
      },
    },
  },
}));

vi.mock("@/lib/email/resendClient", () => ({
  resend: {
    emails: {
      send: resendSendMock,
    },
  },
}));

function createRequest(email = "biz@example.com") {
  return new Request("http://localhost:3000/api/auth/business-magic-link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host: "localhost:3000",
    },
    body: JSON.stringify({ email }),
  });
}

describe("POST /api/auth/business-magic-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a magic link server-side and sends via Resend template", async () => {
    generateLinkMock.mockResolvedValue({
      data: {
        properties: {
          action_link: "http://localhost:3000/irrelevant",
          hashed_token: "hashed_abc",
          verification_type: "email",
        },
      },
      error: null,
    });
    resendSendMock.mockResolvedValue({ data: { id: "msg_1" }, error: null });

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(generateLinkMock).toHaveBeenCalledWith({
      type: "magiclink",
      email: "biz@example.com",
      options: {
        redirectTo: "https://localhost:3000/auth/confirm?next=/onboarding",
      },
    });
    expect(resendSendMock).toHaveBeenCalledWith({
      from: "YourBarrio <no-reply@yourbarrio.com>",
      to: "biz@example.com",
      subject: "YourBarrio — Set up your business account",
      template: {
        id: "business-account-invitation",
        variables: {
          magicLink:
            "https://localhost:3000/auth/confirm?next=%2Fonboarding&token_hash=hashed_abc&type=email",
          supportEmail: "support@yourbarrio.com",
        },
      },
      tags: [{ name: "email_kind", value: "business_magic_link" }],
    });
  });

  it("fails loudly when resend send fails", async () => {
    generateLinkMock.mockResolvedValue({
      data: {
        properties: {
          action_link: "http://localhost:3000/irrelevant",
          hashed_token: "hashed_abc",
          verification_type: "email",
        },
      },
      error: null,
    });
    resendSendMock.mockResolvedValue({
      data: null,
      error: { message: "resend_failed" },
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.error).toBe("resend_failed");
  });
});
