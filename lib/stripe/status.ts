import type Stripe from "stripe";
import { isStripeTestMode, type StripeMode } from "@/lib/stripe/env";

type StripeRequirementSummary = {
  currentlyDue: string[];
  pendingVerification: string[];
  pastDue: string[];
  disabledReason: string | null;
};

type StripeAccountRequirementsLike = {
  currently_due?: string[] | null;
  pending_verification?: string[] | null;
  past_due?: string[] | null;
  disabled_reason?: string | null;
} | null;

type StripeAccountLike = {
  id?: string | null;
  livemode?: boolean | null;
  charges_enabled?: boolean | null;
  payouts_enabled?: boolean | null;
  details_submitted?: boolean | null;
  requirements?: StripeAccountRequirementsLike;
} | null;

export type BusinessStripeStatus = {
  hasStripeAccount: boolean;
  isTestMode: boolean;
  uiStatus:
    | "not_connected"
    | "connected_for_testing"
    | "pending_requirements"
    | "active"
    | "restricted";
  showSetupIncomplete: boolean;
  allowBusinessFeaturesForTesting: boolean;
  badgeLabel: string;
  helpText: string | null;
  stripeRequirementSummary: StripeRequirementSummary;
  connected: boolean;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  statusLabel: string;
  canAcceptPayments: boolean;
};

export type GetBusinessStripeStatusInput = {
  stripeAccountId?: string | null;
  stripeConnected?: boolean | null;
  chargesEnabled?: boolean | null;
  payoutsEnabled?: boolean | null;
  detailsSubmitted?: boolean | null;
  mode?: StripeMode | null;
  stripeAccount?: StripeAccountLike;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function normalizeRequirements(
  requirements?: StripeAccountRequirementsLike
): StripeRequirementSummary {
  return {
    currentlyDue: asStringArray(requirements?.currently_due),
    pendingVerification: asStringArray(requirements?.pending_verification),
    pastDue: asStringArray(requirements?.past_due),
    disabledReason: String(requirements?.disabled_reason || "").trim() || null,
  };
}

function normalizeMode(input: GetBusinessStripeStatusInput): StripeMode {
  if (input.mode === "live" || input.mode === "test") {
    return input.mode;
  }
  return isStripeTestMode({ livemode: input.stripeAccount?.livemode }) ? "test" : "live";
}

function buildPendingHelpText({
  requirements,
  chargesEnabled,
  payoutsEnabled,
  detailsSubmitted,
}: {
  requirements: StripeRequirementSummary;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}) {
  if (requirements.disabledReason) {
    return "Stripe has restricted this account. Complete the requested updates in Stripe before going live.";
  }
  if (requirements.pastDue.length > 0) {
    return "Stripe has overdue requirements for this account. Complete them before accepting live payments.";
  }
  if (requirements.currentlyDue.length > 0) {
    return "Finish Stripe onboarding to enable live payments and payouts.";
  }
  if (requirements.pendingVerification.length > 0) {
    return "Stripe is still verifying this account before it can fully go live.";
  }
  if (!detailsSubmitted) {
    return "Finish submitting your Stripe onboarding details before going live.";
  }
  if (!chargesEnabled || !payoutsEnabled) {
    return "Stripe is still reviewing this account for live charges or payouts.";
  }
  return null;
}

export function getBusinessStripeStatus(
  input: GetBusinessStripeStatusInput
): BusinessStripeStatus {
  const accountId =
    String(input.stripeAccount?.id || "").trim() ||
    String(input.stripeAccountId || "").trim() ||
    null;
  const hasStripeAccount = Boolean(accountId);
  const isTestMode = normalizeMode(input) === "test";
  const chargesEnabled =
    typeof input.stripeAccount?.charges_enabled === "boolean"
      ? input.stripeAccount.charges_enabled === true
      : input.chargesEnabled === true;
  const payoutsEnabled =
    typeof input.stripeAccount?.payouts_enabled === "boolean"
      ? input.stripeAccount.payouts_enabled === true
      : input.payoutsEnabled === true;
  const detailsSubmitted =
    typeof input.stripeAccount?.details_submitted === "boolean"
      ? input.stripeAccount.details_submitted === true
      : input.detailsSubmitted === true;
  const stripeRequirementSummary = normalizeRequirements(input.stripeAccount?.requirements);
  const hasRequirementSignals =
    stripeRequirementSummary.currentlyDue.length > 0 ||
    stripeRequirementSummary.pendingVerification.length > 0 ||
    stripeRequirementSummary.pastDue.length > 0 ||
    Boolean(stripeRequirementSummary.disabledReason);

  if (!hasStripeAccount) {
    return {
      hasStripeAccount: false,
      isTestMode,
      uiStatus: "not_connected",
      showSetupIncomplete: true,
      allowBusinessFeaturesForTesting: false,
      badgeLabel: "Not connected",
      helpText: "Connect Stripe to accept customer payments and route payouts to your business account.",
      stripeRequirementSummary,
      connected: false,
      accountId: null,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
      statusLabel: "Not connected",
      canAcceptPayments: false,
    };
  }

  if (isTestMode) {
    const hasSoftVerificationWarning =
      hasRequirementSignals || !chargesEnabled || !payoutsEnabled || !detailsSubmitted;
    return {
      hasStripeAccount: true,
      isTestMode: true,
      uiStatus: "connected_for_testing",
      showSetupIncomplete: false,
      allowBusinessFeaturesForTesting: true,
      badgeLabel: "Connected (test)",
      helpText: hasSoftVerificationWarning
        ? "Stripe test verification is still pending. This does not block sandbox testing."
        : "Sandbox testing is enabled for this connected Stripe account.",
      stripeRequirementSummary,
      connected: true,
      accountId,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
      statusLabel: "Connected (test)",
      canAcceptPayments: true,
    };
  }

  if (
    stripeRequirementSummary.pastDue.length > 0 ||
    stripeRequirementSummary.disabledReason
  ) {
    return {
      hasStripeAccount: true,
      isTestMode: false,
      uiStatus: "restricted",
      showSetupIncomplete: true,
      allowBusinessFeaturesForTesting: false,
      badgeLabel: "Action required",
      helpText: buildPendingHelpText({
        requirements: stripeRequirementSummary,
        chargesEnabled,
        payoutsEnabled,
        detailsSubmitted,
      }),
      stripeRequirementSummary,
      connected: false,
      accountId,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
      statusLabel: "Action required",
      canAcceptPayments: false,
    };
  }

  if (
    stripeRequirementSummary.currentlyDue.length > 0 ||
    stripeRequirementSummary.pendingVerification.length > 0
  ) {
    return {
      hasStripeAccount: true,
      isTestMode: false,
      uiStatus: "pending_requirements",
      showSetupIncomplete: true,
      allowBusinessFeaturesForTesting: false,
      badgeLabel: "Action required",
      helpText: buildPendingHelpText({
        requirements: stripeRequirementSummary,
        chargesEnabled,
        payoutsEnabled,
        detailsSubmitted,
      }),
      stripeRequirementSummary,
      connected: false,
      accountId,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
      statusLabel: "Action required",
      canAcceptPayments: false,
    };
  }

  if (chargesEnabled && payoutsEnabled) {
    return {
      hasStripeAccount: true,
      isTestMode: false,
      uiStatus: "active",
      showSetupIncomplete: false,
      allowBusinessFeaturesForTesting: false,
      badgeLabel: "Active",
      helpText: "Payments and payouts are enabled for your marketplace orders.",
      stripeRequirementSummary,
      connected: true,
      accountId,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
      statusLabel: "Active",
      canAcceptPayments: true,
    };
  }

  return {
    hasStripeAccount: true,
    isTestMode: false,
    uiStatus: "pending_requirements",
    showSetupIncomplete: true,
    allowBusinessFeaturesForTesting: false,
    badgeLabel: "Action required",
    helpText: buildPendingHelpText({
      requirements: stripeRequirementSummary,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
    }),
    stripeRequirementSummary,
    connected: false,
    accountId,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    statusLabel: "Action required",
    canAcceptPayments: false,
  };
}

export function getStripeAccountStatusInput(
  account?: Stripe.Account | Stripe.DeletedAccount | null
): StripeAccountLike {
  if (!account || "deleted" in account) return null;
  return {
    id: account.id,
    livemode: account.livemode,
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    details_submitted: account.details_submitted,
    requirements: {
      currently_due: account.requirements?.currently_due ?? [],
      pending_verification: account.requirements?.pending_verification ?? [],
      past_due: account.requirements?.past_due ?? [],
      disabled_reason: account.requirements?.disabled_reason ?? null,
    },
  };
}
