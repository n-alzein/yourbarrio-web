const compactSpaces = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

export const decodeHumanLocationString = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  // Some providers encode spaces as '+'.
  const plusFixed = raw.includes("+") ? raw.replace(/\+/g, " ") : raw;
  const shouldDecode = /%[0-9A-Fa-f]{2}/.test(plusFixed);

  if (!shouldDecode) {
    const normalized = compactSpaces(plusFixed);
    return normalized || null;
  }

  try {
    const decoded = decodeURIComponent(plusFixed);
    const normalized = compactSpaces(decoded);
    return normalized || null;
  } catch {
    const normalized = compactSpaces(plusFixed);
    return normalized || null;
  }
};
