import "server-only";

import { getAppUrl, getStripe } from "@/lib/stripe";

type BusinessRow = {
  id: string;
  owner_user_id: string;
  business_name?: string | null;
  email?: string | null;
  stripe_account_id?: string | null;
};

export async function ensureStripeConnectAccount({
  client,
  business,
  authEmail,
}: {
  client: any;
  business: BusinessRow;
  authEmail?: string | null;
}) {
  const existingAccountId = business?.stripe_account_id?.trim() || null;
  if (existingAccountId) {
    return existingAccountId;
  }

  const stripe = getStripe();
  const email = business?.email?.trim() || authEmail?.trim() || undefined;

  const account = await stripe.accounts.create({
    type: "express",
    country: "US",
    email,
    business_profile: business?.business_name
      ? { name: business.business_name.trim() }
      : undefined,
    metadata: {
      business_id: business.id,
      owner_user_id: business.owner_user_id,
    },
  });

  const { error } = await client
    .from("businesses")
    .update({
      stripe_account_id: account.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", business.id)
    .eq("owner_user_id", business.owner_user_id);

  if (error) {
    throw new Error(error.message || "Failed to save Stripe account");
  }

  return account.id;
}

export async function createStripeOnboardingLink(accountId: string) {
  const stripe = getStripe();
  const appUrl = getAppUrl();
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/business/dashboard?stripe=refresh`,
    return_url: `${appUrl}/business/dashboard?stripe=return`,
    type: "account_onboarding",
  });
}
