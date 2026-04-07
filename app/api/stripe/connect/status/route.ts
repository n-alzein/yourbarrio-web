import { NextResponse } from "next/server";
import { getCurrentBusinessStripeContext } from "@/lib/business/getCurrentBusinessStripeContext";
import { getStripe } from "@/lib/stripe";
import { getStripeModeFromSecretKey, getStripeSecretKey } from "@/lib/stripe/env";
import {
  getBusinessStripeStatus,
  getStripeAccountStatusInput,
} from "@/lib/stripe/status";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  const access = await getCurrentBusinessStripeContext();
  if (!access.ok) {
    return jsonError(access.error, access.status);
  }

  const accountId = access.business?.stripe_account_id?.trim() || null;
  let stripeAccount = null;

  if (accountId) {
    try {
      const account = await getStripe().accounts.retrieve(accountId);
      stripeAccount = getStripeAccountStatusInput(account);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[STRIPE_STATUS_TRACE] account_fetch_failed", {
          businessId: access.business?.id || access.businessId || null,
          stripeAccountId: accountId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const status = getBusinessStripeStatus({
    stripeAccountId: accountId,
    chargesEnabled: access.business?.stripe_charges_enabled,
    payoutsEnabled: access.business?.stripe_payouts_enabled,
    detailsSubmitted: access.business?.stripe_details_submitted,
    mode: getStripeModeFromSecretKey(getStripeSecretKey()),
    stripeAccount,
  });

  if (process.env.NODE_ENV !== "production") {
    console.warn("[STRIPE_STATUS_TRACE]", {
      businessId: access.business?.id || access.businessId || null,
      stripeAccountId: status.accountId,
      isTestMode: status.isTestMode,
      uiStatus: status.uiStatus,
      showSetupIncomplete: status.showSetupIncomplete,
      currentlyDueCount: status.stripeRequirementSummary.currentlyDue.length,
      pendingVerificationCount:
        status.stripeRequirementSummary.pendingVerification.length,
    });
  }

  return NextResponse.json(status, { status: 200 });
}
