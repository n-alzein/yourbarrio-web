import "server-only";

import { getBusinessDataClientForRequest } from "@/lib/business/getBusinessDataClientForRequest";

export async function getCurrentBusinessStripeContext() {
  const access = await getBusinessDataClientForRequest();
  if (!access.ok) {
    return access;
  }

  const { data, error } = await access.client
    .from("businesses")
    .select(
      [
        "id",
        "owner_user_id",
        "business_name",
        "stripe_account_id",
        "stripe_charges_enabled",
        "stripe_payouts_enabled",
        "stripe_details_submitted",
      ].join(",")
    )
    .eq("owner_user_id", access.effectiveUserId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      error: error.message || "Failed to load business profile",
    };
  }

  if (!data?.owner_user_id) {
    return {
      ok: false,
      status: 404,
      error: "Business profile not found",
    };
  }

  return {
    ok: true,
    ...access,
    business: data,
  };
}
