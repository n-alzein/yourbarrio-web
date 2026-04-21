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

function normalizeAvatarCandidate(value) {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function collectAvatarCandidates(value, output) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectAvatarCandidates(item, output));
    return;
  }

  if (value && typeof value === "object") {
    METADATA_AVATAR_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        collectAvatarCandidates(value[key], output);
      }
    });
    return;
  }

  output.push(value);
}

export function getValidAvatarUrl(...candidates) {
  const flattenedCandidates = [];
  collectAvatarCandidates(candidates, flattenedCandidates);

  for (const candidate of flattenedCandidates) {
    const value = normalizeAvatarCandidate(candidate);
    const normalized = value.toLowerCase();

    if (INVALID_AVATAR_VALUES.has(normalized)) continue;
    if (PLACEHOLDER_AVATAR_PATHS.has(value)) continue;

    return value;
  }

  return null;
}

export function resolveAvatarUrl(...candidates) {
  return getValidAvatarUrl(...candidates);
}

export function mergeAvatarState(prev, next) {
  const nextUrl = getValidAvatarUrl(next);
  if (nextUrl) return nextUrl;
  return getValidAvatarUrl(prev);
}
