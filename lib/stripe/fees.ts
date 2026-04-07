export function calculatePlatformFeeAmount(amountCents: number) {
  const normalized = Number(amountCents || 0);
  if (!Number.isFinite(normalized) || normalized <= 0) return 0;
  return Math.round(normalized * 0.1);
}

export function calculatePlatformFeeDollars(amountDollars: number) {
  const normalized = Number(amountDollars || 0);
  if (!Number.isFinite(normalized) || normalized <= 0) return 0;
  return calculatePlatformFeeAmount(Math.round(normalized * 100)) / 100;
}
