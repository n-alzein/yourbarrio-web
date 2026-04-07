import { NextResponse } from "next/server";
import { getCurrentBusinessStripeContext } from "@/lib/business/getCurrentBusinessStripeContext";
import { createStripeOnboardingLink } from "@/lib/stripe/connect";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST() {
  const access = await getCurrentBusinessStripeContext();
  if (!access.ok) {
    return jsonError(access.error, access.status);
  }

  const accountId = access.business?.stripe_account_id?.trim() || null;
  if (!accountId) {
    return jsonError("Stripe account not connected", 400);
  }

  try {
    const link = await createStripeOnboardingLink(accountId);
    return NextResponse.json({ url: link.url, accountId }, { status: 200 });
  } catch (error: any) {
    return jsonError(
      error?.message || "Failed to create Stripe onboarding link",
      500
    );
  }
}
