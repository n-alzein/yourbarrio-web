export function formatUSPhone(value) {
  const rawDigits = String(value ?? "").replace(/\D/g, "");
  const digits = rawDigits.length === 11 && rawDigits.startsWith("1")
    ? rawDigits.slice(1)
    : rawDigits.slice(0, 10);
  const parts = [];

  if (digits.length > 0) parts.push(`(${digits.slice(0, 3)}`);
  if (digits.length >= 4) parts.push(`) ${digits.slice(3, 6)}`);
  if (digits.length >= 7) parts.push(`-${digits.slice(6, 10)}`);

  return parts.join("");
}
