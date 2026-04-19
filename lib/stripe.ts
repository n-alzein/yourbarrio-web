import "server-only";

import Stripe from "stripe";
import { getStripeSecretKey } from "@/lib/stripe/env";

let stripeClient: Stripe | null = null;

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required Stripe environment variable: ${name}`);
  }
  return value;
}

export function getStripe() {
  if (stripeClient) return stripeClient;
  stripeClient = new Stripe(getStripeSecretKey());
  return stripeClient;
}

export function getStripePublishableKey() {
  return getRequiredEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
}

export function getStripeWebhookSecret() {
  return getRequiredEnv("STRIPE_WEBHOOK_SECRET");
}

export function getAppUrl() {
  const appUrl =
    process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) {
    throw new Error(
      "Missing required app URL environment variable: APP_URL or NEXT_PUBLIC_APP_URL"
    );
  }
  return appUrl.replace(/\/+$/, "");
}

export function dollarsToCents(value: number | string | null | undefined) {
  const normalized = Number(value || 0);
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error("Invalid dollar amount");
  }
  return Math.round(normalized * 100);
}

export function centsToDollars(value: number) {
  const normalized = Number(value || 0);
  if (!Number.isFinite(normalized) || normalized < 0) return 0;
  return normalized / 100;
}
