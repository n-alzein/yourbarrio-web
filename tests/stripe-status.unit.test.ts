import { describe, expect, it } from "vitest";
import { getBusinessStripeStatus } from "@/lib/stripe/status";

describe("getBusinessStripeStatus", () => {
  it("marks businesses without a Stripe account as not connected", () => {
    const status = getBusinessStripeStatus({ mode: "test" });

    expect(status.uiStatus).toBe("not_connected");
    expect(status.showSetupIncomplete).toBe(true);
    expect(status.allowBusinessFeaturesForTesting).toBe(false);
    expect(status.badgeLabel).toBe("Not connected");
  });

  it("treats a test-mode account as connected even when capabilities are false", () => {
    const status = getBusinessStripeStatus({
      mode: "test",
      stripeAccountId: "acct_test_123",
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
    });

    expect(status.uiStatus).toBe("connected_for_testing");
    expect(status.showSetupIncomplete).toBe(false);
    expect(status.allowBusinessFeaturesForTesting).toBe(true);
    expect(status.canAcceptPayments).toBe(true);
    expect(status.badgeLabel).toBe("Connected (test)");
  });

  it("keeps test-mode accounts connected when requirements are still due", () => {
    const status = getBusinessStripeStatus({
      mode: "test",
      stripeAccountId: "acct_test_123",
      stripeAccount: {
        id: "acct_test_123",
        livemode: false,
        requirements: {
          currently_due: ["external_account"],
        },
      },
    });

    expect(status.uiStatus).toBe("connected_for_testing");
    expect(status.helpText).toContain("does not block sandbox testing");
    expect(status.stripeRequirementSummary.currentlyDue).toEqual(["external_account"]);
  });

  it("requires action in live mode when requirements are currently due", () => {
    const status = getBusinessStripeStatus({
      mode: "live",
      stripeAccountId: "acct_live_123",
      stripeAccount: {
        id: "acct_live_123",
        livemode: true,
        charges_enabled: false,
        payouts_enabled: false,
        requirements: {
          currently_due: ["business_profile.mcc"],
        },
      },
    });

    expect(status.uiStatus).toBe("pending_requirements");
    expect(status.showSetupIncomplete).toBe(true);
    expect(status.badgeLabel).toBe("Action required");
    expect(status.canAcceptPayments).toBe(false);
  });

  it("marks live accounts active only when charges and payouts are enabled", () => {
    const status = getBusinessStripeStatus({
      mode: "live",
      stripeAccountId: "acct_live_123",
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
    });

    expect(status.uiStatus).toBe("active");
    expect(status.showSetupIncomplete).toBe(false);
    expect(status.badgeLabel).toBe("Active");
    expect(status.canAcceptPayments).toBe(true);
  });

  it("keeps live accounts pending when payouts are not enabled", () => {
    const status = getBusinessStripeStatus({
      mode: "live",
      stripeAccountId: "acct_live_123",
      chargesEnabled: true,
      payoutsEnabled: false,
      detailsSubmitted: true,
    });

    expect(status.uiStatus).toBe("pending_requirements");
    expect(status.showSetupIncomplete).toBe(true);
    expect(status.canAcceptPayments).toBe(false);
  });
});
