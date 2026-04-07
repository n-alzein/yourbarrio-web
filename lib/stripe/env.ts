export type StripeMode = "test" | "live";

function normalizeSecretKey(secretKey?: string | null) {
  const value = String(secretKey || "").trim();
  return value || null;
}

export function getStripeSecretKey() {
  const secretKey = normalizeSecretKey(process.env.STRIPE_SECRET_KEY);
  if (!secretKey) {
    throw new Error("Missing required Stripe environment variable: STRIPE_SECRET_KEY");
  }
  return secretKey;
}

export function getStripeModeFromSecretKey(secretKey?: string | null): StripeMode {
  const normalized = normalizeSecretKey(secretKey);
  return normalized?.startsWith("sk_live_") ? "live" : "test";
}

export function isStripeTestMode(input?: {
  livemode?: boolean | null;
  secretKey?: string | null;
}) {
  if (typeof input?.livemode === "boolean") {
    return input.livemode !== true;
  }
  return getStripeModeFromSecretKey(input?.secretKey ?? process.env.STRIPE_SECRET_KEY) === "test";
}
