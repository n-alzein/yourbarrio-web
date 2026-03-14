import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSiteUrlFromRequest } from "@/lib/auth/getSiteUrl";
import { supabaseAdmin } from "@/lib/auth/supabaseAdmin";
import { resend } from "@/lib/email/resendClient";

const requestSchema = z.object({
  email: z.string().trim().email().max(320),
});

function getBusinessRedirectTo(siteUrl: string) {
  return `${siteUrl}/auth/confirm?next=/onboarding`;
}

function normalizeVerifyType(input: string) {
  const normalized = String(input || "").trim().toLowerCase();
  if (!normalized || normalized === "magiclink") return "email";
  return normalized;
}

function buildTokenHashConfirmLink(siteUrl: string, tokenHash: string, type = "email") {
  const link = new URL("/auth/confirm", siteUrl);
  link.searchParams.set("next", "/onboarding");
  link.searchParams.set("token_hash", tokenHash);
  link.searchParams.set("type", normalizeVerifyType(type));
  return link.toString();
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email payload" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const siteUrl = getSiteUrlFromRequest(request);

  if (process.env.NODE_ENV !== "production") {
    console.log("[invite-flow] PATH=BUSINESS_MAGIC_LINK_ROUTE reached", { email });
  }

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: getBusinessRedirectTo(siteUrl),
    },
  });

  if (error) {
    console.error("[business-magic-link] generateLink failed", {
      email,
      error: error.message,
    });
    return NextResponse.json(
      { error: error.message || "Failed to generate business magic link" },
      { status: 500 }
    );
  }

  const hashedToken = data?.properties?.hashed_token || "";
  const verificationType = String(data?.properties?.verification_type || "email");
  const magicLink = hashedToken
    ? buildTokenHashConfirmLink(siteUrl, hashedToken, verificationType)
    : "";
  if (!magicLink) {
    console.error("[business-magic-link] missing_auth_payload", {
      email,
      hasHashedToken: Boolean(hashedToken),
    });
    return NextResponse.json({ error: "Missing action_link" }, { status: 500 });
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[AUTH_CALLBACK_TRACE] business_magic_link_payload", {
      finalAppUrl: magicLink,
      hasTokenHash: magicLink.includes("token_hash="),
      verificationType,
    });
  }

  const { error: resendError } = await resend.emails.send({
    from: "YourBarrio <no-reply@yourbarrio.com>",
    to: email,
    subject: "YourBarrio — Set up your business account",
    template: {
      id: "business-account-invitation",
      variables: {
        magicLink,
        supportEmail: "support@yourbarrio.com",
      },
    },
    tags: [{ name: "email_kind", value: "business_magic_link" }],
  });

  if (resendError) {
    console.error("[business-magic-link] resend failed", {
      email,
      error: resendError.message || "unknown_error",
    });
    return NextResponse.json(
      { error: resendError.message || "Failed to send business magic link email" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
