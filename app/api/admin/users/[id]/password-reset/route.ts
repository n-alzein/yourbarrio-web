import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { requireAdminApiRole } from "@/lib/admin/requireAdminApiRole";
import { buildConfirmStartUrl } from "@/lib/auth/confirmStart";
import { getSiteUrlFromRequest } from "@/lib/auth/getSiteUrl";
import { supabaseAdmin } from "@/lib/auth/supabaseAdmin";
import { sendResetPasswordEmail } from "@/lib/email/sendResetPasswordEmail";
import { getSupabaseRefFromUrl } from "@/lib/supabase/ref";

const passwordResetSchema = z.object({
  targetEmail: z.string().email().max(320),
  reason: z.string().trim().min(10).max(500),
});
const paramsSchema = z.object({
  id: z.string().uuid(),
});

function getRequestIp(request: NextRequest): string | null {
  const fromHeader = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "";
  const first = fromHeader.split(",")[0]?.trim() || "";
  return first || null;
}

function getResetRedirectTo(siteUrl: string): string {
  return `${siteUrl}/auth/confirm?next=/set-password`;
}

function fingerprint(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApiRole("admin_super");
  if (auth.ok === false) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid target user id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = passwordResetSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const normalizedTargetUserId = parsedParams.data.id;

  const targetEmail = parsed.data.targetEmail.trim().toLowerCase();
  const reason = parsed.data.reason.trim();
  const siteUrl = getSiteUrlFromRequest(request);
  const redirectTo = getResetRedirectTo(siteUrl);
  const generationSupabaseUrl = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const verificationSupabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const genRef = getSupabaseRefFromUrl(generationSupabaseUrl);
  const verifyRef = getSupabaseRefFromUrl(verificationSupabaseUrl);
  if (genRef !== verifyRef) {
    console.error("[auth.admin-reset] supabase_ref_mismatch", {
      gen_ref: genRef,
      verify_ref: verifyRef,
    });
    if (process.env.NODE_ENV !== "production") {
      throw new Error("Supabase project mismatch between generation and verification");
    }
  }
  let resetProviderError: string | null = null;

  // Keep response enumeration-safe: callers always get success regardless of auth response.
  try {
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: targetEmail,
      options: { redirectTo },
    });

    if (error) {
      resetProviderError = error.message || "generate_link_failed";
    } else {
      const tokenHash = data?.properties?.hashed_token;
      if (!tokenHash) {
        resetProviderError = "missing_hashed_token";
      } else {
        console.info("[auth.admin-reset] generated_token", {
          type: "recovery",
          supabase_ref_generation: genRef,
          token_hash_len: tokenHash.length,
          token_hash_fp: fingerprint(tokenHash),
        });
        const resetUrl = buildConfirmStartUrl(tokenHash, "recovery", "/set-password", siteUrl);
        await sendResetPasswordEmail({
          to: targetEmail,
          resetUrl,
          productName: "YourBarrio",
          supportEmail: "support@yourbarrio.com",
        });
      }
    }
  } catch (error: any) {
    resetProviderError = error?.message || "reset_send_failed";
  }

  await audit({
    action: "admin.user.send_password_reset",
    targetType: "user",
    targetId: normalizedTargetUserId,
    actorUserId: auth.actorUser.id,
    meta: {
      reason,
      targetEmail,
      requesterAdminId: auth.actorUser.id,
      requesterAdminEmail: auth.actorUser.email,
      requestIp: getRequestIp(request),
      requestUserAgent: request.headers.get("user-agent") || null,
      redirectTo,
      resetProviderError,
    },
  });

  return NextResponse.json({ success: true });
}
