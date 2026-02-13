import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

const MIN_PASSWORD_LENGTH = 8;

const setPasswordSchema = z
  .object({
    password: z.string().min(MIN_PASSWORD_LENGTH),
    password_confirm: z.string().min(1),
    token_hash: z.string().trim().min(1).optional(),
    hashed_token: z.string().trim().min(1).optional(),
    type: z.enum(["recovery", "invite", "email", "email_change"]).optional(),
  })
  .refine((value) => value.password === value.password_confirm, {
    message: "password_mismatch",
    path: ["password_confirm"],
  });

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status });
}

function withSupabaseCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  return target;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = setPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return jsonResponse({ ok: false, error: "invalid_payload" }, 400);
  }

  const type = parsed.data.type || "recovery";
  if (type !== "recovery") {
    return jsonResponse({ ok: false, error: "invalid_type" }, 400);
  }

  const tokenHash = parsed.data.token_hash || parsed.data.hashed_token || "";

  const cookieCarrier = NextResponse.next();
  const supabase = createSupabaseRouteHandlerClient(request, cookieCarrier);

  if (tokenHash) {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });

    if (verifyError) {
      return withSupabaseCookies(
        cookieCarrier,
        jsonResponse({ ok: false, error: "invalid_or_expired_link" }, 400)
      );
    }
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (updateError) {
    return withSupabaseCookies(
      cookieCarrier,
      jsonResponse({ ok: false, error: "update_failed" }, 400)
    );
  }

  return withSupabaseCookies(
    cookieCarrier,
    jsonResponse({ ok: true, redirectTo: "/signin?reset=success" })
  );
}
