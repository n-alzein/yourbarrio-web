export type ListingPricingBreakdown = {
  basePriceCents: number;
  platformFeeCents: number;
  finalPriceCents: number;
};

export type CheckoutPricingBreakdown = {
  baseSubtotalCents: number;
  platformFeeCents: number;
  subtotalBeforeTaxCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  totalCents: number;
};

const PLATFORM_FEE_RATE = 0.05;

export function dollarsToPricingCents(value: number | string | null | undefined) {
  const normalized = Number(value || 0);
  if (!Number.isFinite(normalized) || normalized <= 0) return 0;
  return Math.round(normalized * 100);
}

export function calculatePlatformFeeAmount(amountCents: number) {
  const normalized = Number(amountCents || 0);
  if (!Number.isFinite(normalized) || normalized <= 0) return 0;
  return Math.round(normalized * PLATFORM_FEE_RATE);
}

export function calculatePlatformFeeDollars(amountDollars: number) {
  return calculatePlatformFeeAmount(dollarsToPricingCents(amountDollars)) / 100;
}

export function calculateListingPricing(
  price: number | string | null | undefined
): ListingPricingBreakdown {
  const basePriceCents = dollarsToPricingCents(price);
  const platformFeeCents = calculatePlatformFeeAmount(basePriceCents);
  return {
    basePriceCents,
    platformFeeCents,
    finalPriceCents: basePriceCents + platformFeeCents,
  };
}

export function calculateCheckoutPricing({
  subtotalCents,
  deliveryFeeCents = 0,
  taxCents = 0,
}: {
  subtotalCents: number;
  deliveryFeeCents?: number;
  taxCents?: number;
}): CheckoutPricingBreakdown {
  const baseSubtotalCents = Math.max(0, Math.round(Number(subtotalCents || 0)));
  const normalizedDeliveryFeeCents = Math.max(0, Math.round(Number(deliveryFeeCents || 0)));
  const normalizedTaxCents = Math.max(0, Math.round(Number(taxCents || 0)));
  const platformFeeCents = calculatePlatformFeeAmount(baseSubtotalCents);
  const subtotalBeforeTaxCents =
    baseSubtotalCents + platformFeeCents + normalizedDeliveryFeeCents;

  return {
    baseSubtotalCents,
    platformFeeCents,
    subtotalBeforeTaxCents,
    taxCents: normalizedTaxCents,
    deliveryFeeCents: normalizedDeliveryFeeCents,
    totalCents: subtotalBeforeTaxCents + normalizedTaxCents,
  };
}

export function withListingPricing<T extends { price?: number | string | null }>(
  listing: T
): T & {
  priceCents: number;
  platformFeeCents: number;
  finalPriceCents: number;
} {
  const pricing = calculateListingPricing(listing?.price);
  return {
    ...listing,
    priceCents: pricing.basePriceCents,
    platformFeeCents: pricing.platformFeeCents,
    finalPriceCents: pricing.finalPriceCents,
  };
}
