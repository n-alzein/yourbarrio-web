export function getUSPhoneDigits(value) {
  const rawDigits = String(value ?? "").replace(/\D/g, "");
  const digits =
    rawDigits.length === 11 && rawDigits.startsWith("1")
      ? rawDigits.slice(1)
      : rawDigits;

  return digits.slice(0, 10);
}

export const getUsPhoneDigits = getUSPhoneDigits;

export function formatUSPhone(value) {
  const digits = getUSPhoneDigits(value);
  const parts = [];

  if (digits.length > 0) parts.push(`(${digits.slice(0, 3)}`);
  if (digits.length >= 4) parts.push(`) ${digits.slice(3, 6)}`);
  if (digits.length >= 7) parts.push(`-${digits.slice(6, 10)}`);

  return parts.join("");
}

export const normalizeUsPhoneInput = formatUSPhone;

export function normalizeUSPhoneForStorage(value) {
  const digits = getUSPhoneDigits(value);
  return digits.length === 10 ? formatUSPhone(digits) : "";
}

export const formatUsPhoneFromDigits = normalizeUSPhoneForStorage;

export function isIncompleteUSPhone(value) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) return false;
  return getUSPhoneDigits(rawValue).length < 10;
}

export function isCompleteUsPhone(value) {
  return getUSPhoneDigits(value).length === 10;
}
