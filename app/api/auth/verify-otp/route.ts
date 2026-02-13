import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { getSafeRedirectPath } from "@/lib/auth/redirects";
import { createSupabaseRouteHandlerClient } from "@/lib/supabaseServer";
import { getSupabaseRefFromUrl } from "@/lib/supabase/ref";

const verifySchema = z.object({
  token_hash: z.string().trim().min(1).optional(),
  hashed_token: z.string().trim().min(1).optional(),
  type: z.enum(["recovery", "invite", "email", "email_change"]),
  next: z.string().optional(),
}).refine((value) => Boolean(value.token_hash || value.hashed_token), {
  message: "missing_token_hash",
});

function fingerprint(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

async function readPayload(request: NextRequest) {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    return await request.json().catch(() => null);
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData().catch(() => null);
    if (!formData) return null;
    return {
      token_hash: formData.get("token_hash"),
      hashed_token: formData.get("hashed_token"),
      type: formData.get("type"),
      next: formData.get("next"),
    };
  }

  return null;
}

export async function POST(request: NextRequest) {
  const body = await readPayload(request);
  const parsed = verifySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.redirect(
      new URL("/set-password?error=invalid_or_expired", request.url),
      { status: 303 }
    );
  }

  const token_hash = parsed.data.token_hash || parsed.data.hashed_token || "";
  const type = parsed.data.type;
  const verificationSupabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const verificationRef = getSupabaseRefFromUrl(verificationSupabaseUrl);
  console.info("[verify-otp] payload", {
    type,
    supabase_ref_verification: verificationRef,
    token_hash_len: token_hash.length,
    token_hash_fp: fingerprint(token_hash),
  });

  const redirectTo = getSafeRedirectPath(parsed.data.next || "") || "/set-password";
  const response = NextResponse.redirect(new URL(redirectTo, request.url), { status: 303 });
  const supabase = createSupabaseRouteHandlerClient(request, response);

  const { error } = await supabase.auth.verifyOtp({
    token_hash,
    type,
  });

  if (error) {
    console.warn("[verify-otp] verifyOtp failed", {
      type,
      supabase_ref_verification: verificationRef,
      token_hash_len: token_hash.length,
      token_hash_fp: fingerprint(token_hash),
      status: (error as any)?.status,
      name: (error as any)?.name,
      code: (error as any)?.code,
    });
    response.headers.set(
      "location",
      new URL("/set-password?error=invalid_or_expired", request.url).toString()
    );
  }

  return response;
}
