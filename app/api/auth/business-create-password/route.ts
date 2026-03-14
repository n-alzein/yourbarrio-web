import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  BUSINESS_ONBOARDING_PATH,
  BUSINESS_PASSWORD_MIN_LENGTH,
  getBusinessPasswordGateState,
  isBusinessPasswordSetupCandidate,
} from "@/lib/auth/businessPasswordGate";
import { ensureBusinessProvisionedForUser } from "@/lib/auth/ensureBusinessProvisioning";
import { createSupabaseRouteHandlerClient } from "@/lib/supabaseServer";
import { getSupabaseServerClient as getServiceRoleClient } from "@/lib/supabase/server";

const schema = z
  .object({
    password: z.string().min(BUSINESS_PASSWORD_MIN_LENGTH),
    password_confirm: z.string().min(1),
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

function getPasswordErrorMessage(errorMessage: string) {
  const message = String(errorMessage || "").toLowerCase();
  if (message.includes("same") || message.includes("reuse") || message.includes("previous")) {
    return "Choose a password you have not used before.";
  }
  return "We couldn't create your password. Please try again.";
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return jsonResponse({ ok: false, error: "invalid_payload" }, 400);
  }

  const cookieCarrier = NextResponse.next();
  const supabase = createSupabaseRouteHandlerClient(request, cookieCarrier);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return withSupabaseCookies(
      cookieCarrier,
      jsonResponse({ ok: false, error: "unauthorized" }, 401)
    );
  }

  const fallbackRole =
    user.app_metadata?.role || user.user_metadata?.role || null;

  if (fallbackRole === "business") {
    await ensureBusinessProvisionedForUser({
      userId: user.id,
      email: user.email || "",
      source: "business_create_password_route",
    });
  }

  const businessGate = await getBusinessPasswordGateState({
    supabase,
    userId: user.id,
    fallbackRole,
  });

  const allowBusinessPasswordSetup = isBusinessPasswordSetupCandidate({
    role: businessGate.role,
    fallbackRole,
    passwordSet: businessGate.passwordSet,
    businessRow: businessGate.businessRow,
  });

  if (businessGate.role !== "business" && !allowBusinessPasswordSetup) {
    return withSupabaseCookies(
      cookieCarrier,
      jsonResponse({ ok: false, error: "forbidden" }, 403)
    );
  }

  if (businessGate.passwordSet) {
    return withSupabaseCookies(
      cookieCarrier,
      jsonResponse({ ok: true, redirectTo: BUSINESS_ONBOARDING_PATH })
    );
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (updateError) {
    return withSupabaseCookies(
      cookieCarrier,
      jsonResponse(
        {
          ok: false,
          error: "update_failed",
          message: getPasswordErrorMessage(updateError.message || ""),
        },
        400
      )
    );
  }

  const serviceClient = getServiceRoleClient();
  if (!serviceClient) {
    return withSupabaseCookies(
      cookieCarrier,
      jsonResponse({ ok: false, error: "server_unavailable" }, 500)
    );
  }

  const { error: profileUpdateError } = await serviceClient
    .from("users")
    .update({
      password_set: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (profileUpdateError) {
    return withSupabaseCookies(
      cookieCarrier,
      jsonResponse({ ok: false, error: "profile_update_failed" }, 500)
    );
  }

  return withSupabaseCookies(
    cookieCarrier,
    jsonResponse({ ok: true, redirectTo: BUSINESS_ONBOARDING_PATH })
  );
}
