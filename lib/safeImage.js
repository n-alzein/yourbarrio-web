const failedSrcs = new Set();
const warnedSrcs = new Set();

function getSupabasePublicBase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  return `${url.replace(/\/$/, "")}/storage/v1/object/public/`;
}

const SUPABASE_PUBLIC_BASE = getSupabasePublicBase();

function looksLikeUrl(value) {
  return /^(https?:\/\/|data:|blob:)/i.test(value);
}

function buildSupabasePublicUrl(key) {
  if (!SUPABASE_PUBLIC_BASE) return null;
  const safeKey = String(key || "").replace(/^\/+/, "");
  if (!safeKey) return null;
  return `${SUPABASE_PUBLIC_BASE}${safeKey}`;
}

function normalizeRelativeCandidate(value) {
  const cleaned = value.replace(/^\/*/, "/");
  return cleaned || null;
}

export function resolveImageSrc(
  input,
  fallback = "/business-placeholder.png",
  options = undefined
) {
  const raw =
    typeof input === "string"
      ? input.trim()
      : input != null
        ? String(input).trim()
        : "";
  const fallbackSrc = fallback || "/business-placeholder.png";
  const respectFailures = options?.respectFailures !== false;

  if (!raw) return fallbackSrc;

  if (respectFailures && failedSrcs.has(raw)) return fallbackSrc;

  if (looksLikeUrl(raw)) return raw;

  if (raw.includes("supabase.co/storage/v1/object/public")) {
    return raw;
  }

  if (
    /^[\\/]?listing-photos[\\/]/i.test(raw) ||
    /^[\\/]?profile-photos[\\/]/i.test(raw) ||
    /^[\\/]?avatars[\\/]/i.test(raw) ||
    /^[\\/]?business-photos[\\/]/i.test(raw) ||
    /^[\\/]?business-gallery[\\/]/i.test(raw) ||
    /^[\\/]?public[\\/]listing-photos[\\/]/i.test(raw) ||
    /^[\\/]?public[\\/]business-photos[\\/]/i.test(raw)
  ) {
    const supabaseUrl = buildSupabasePublicUrl(raw);
    if (supabaseUrl) {
      if (respectFailures && failedSrcs.has(supabaseUrl)) return fallbackSrc;
      return supabaseUrl;
    }
  }

  const relativeCandidate = normalizeRelativeCandidate(raw);
  if (relativeCandidate && relativeCandidate.startsWith("/")) {
    if (respectFailures && failedSrcs.has(relativeCandidate)) return fallbackSrc;
    return relativeCandidate;
  }

  if (process.env.NODE_ENV !== "production" && !warnedSrcs.has(raw)) {
    console.warn("[safeImage] Invalid or partial image src. Using fallback.", raw);
    warnedSrcs.add(raw);
  }

  return fallbackSrc;
}

export function markImageFailed(src) {
  if (!src) return;
  failedSrcs.add(src);
}
