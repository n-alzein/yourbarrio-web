import { NextResponse } from "next/server";
import { getCurrentBusinessStripeContext } from "@/lib/business/getCurrentBusinessStripeContext";
import {
  createStripeOnboardingLink,
  ensureStripeConnectAccount,
} from "@/lib/stripe/connect";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST() {
  const access = await getCurrentBusinessStripeContext();
  if (!access.ok) {
    return jsonError(access.error, access.status);
  }

  try {
    const accountId = await ensureStripeConnectAccount({
      client: access.client,
      business: access.business,
      authEmail: null,
    });
    const link = await createStripeOnboardingLink(accountId);

    return NextResponse.json(
      {
        url: link.url,
        accountId,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return jsonError(error?.message || "Failed to start Stripe onboarding", 500);
  }
}
