const INVALID_AVATAR_VALUES = new Set(["", "null", "undefined"]);

const PLACEHOLDER_AVATAR_PATHS = new Set([
  "/business-placeholder.png",
  "/customer-placeholder.png",
]);

const METADATA_AVATAR_KEYS = [
  "avatar_url",
  "picture",
  "profile_photo_url",
  "photo_url",
  "photoURL",
  "image_url",
  "image",
];

const METADATA_CONTAINER_KEYS = [
  "user_metadata",
  "auth_metadata",
  "metadata",
  "raw_user_meta_data",
];

const STORAGE_AVATAR_PREFIXES = [
  "listing-photos/",
  "profile-photos/",
  "avatars/",
  "business-photos/",
  "business-gallery/",
  "public/listing-photos/",
  "public/business-photos/",
];

function normalizeAvatarCandidate(value) {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isRenderableAvatarCandidate(value) {
  if (!value) return false;
  if (/^(data:image\/|blob:)/i.test(value)) return true;
  if (/^https?:\/\//i.test(value)) return isHttpUrl(value);
  if (value.startsWith("//")) return false;
  if (value.startsWith("/")) return true;

  const normalized = value.replace(/^\/+/, "").toLowerCase();
  return STORAGE_AVATAR_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function collectAvatarCandidates(value, output, seen = new WeakSet()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectAvatarCandidates(item, output, seen));
    return;
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) return;
    seen.add(value);
    METADATA_AVATAR_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        collectAvatarCandidates(value[key], output, seen);
      }
    });
    METADATA_CONTAINER_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        collectAvatarCandidates(value[key], output, seen);
      }
    });
    return;
  }

  output.push(value);
}

export function getValidAvatarUrls(...candidates) {
  const flattenedCandidates = [];
  collectAvatarCandidates(candidates, flattenedCandidates);
  const urls = [];
  const seen = new Set();

  for (const candidate of flattenedCandidates) {
    const value = normalizeAvatarCandidate(candidate);
    const normalized = value.toLowerCase();

    if (INVALID_AVATAR_VALUES.has(normalized)) continue;
    if (PLACEHOLDER_AVATAR_PATHS.has(value)) continue;
    if (!isRenderableAvatarCandidate(value)) continue;
    if (seen.has(value)) continue;

    urls.push(value);
    seen.add(value);
  }

  return urls;
}

export function getValidAvatarUrl(...candidates) {
  return getValidAvatarUrls(...candidates)[0] || null;
}

export function resolveAvatarUrl(...candidates) {
  return getValidAvatarUrl(...candidates);
}

export function mergeAvatarState(prev, next) {
  const nextUrl = getValidAvatarUrl(next);
  if (nextUrl) return nextUrl;
  return getValidAvatarUrl(prev);
}
