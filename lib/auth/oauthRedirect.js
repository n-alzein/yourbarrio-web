function normalizeOrigin(value) {
  const input = String(value || "").trim();
  if (!input) return "";
  try {
    const url = new URL(input);
    return url.origin;
  } catch {
    return "";
  }
}

function isLocalHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

function shouldUseConfiguredCanonical(currentOrigin, configuredOrigin) {
  if (!currentOrigin || !configuredOrigin) return false;
  try {
    const current = new URL(currentOrigin);
    const configured = new URL(configuredOrigin);
    if (isLocalHost(current.hostname)) return false;
    return (
      current.hostname === configured.hostname ||
      current.hostname.endsWith(".yourbarrio.com")
    );
  } catch {
    return false;
  }
}

function getYourBarrioCanonicalOrigin(currentOrigin) {
  try {
    const current = new URL(currentOrigin);
    if (isLocalHost(current.hostname)) return "";
    if (current.hostname.endsWith(".yourbarrio.com") || current.hostname === "yourbarrio.com") {
      return "https://www.yourbarrio.com";
    }
  } catch {
    // fall through
  }
  return "";
}

// Host canonicalization must stay aligned with Supabase cookie scope in
// lib/authCookies.js and the final redirect origin in app/api/auth/callback.
export function getOAuthRedirectOrigin(currentOrigin) {
  const detectedOrigin = normalizeOrigin(currentOrigin);
  const configuredOrigin = normalizeOrigin(
    process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || ""
  );
  if (shouldUseConfiguredCanonical(detectedOrigin, configuredOrigin)) {
    return configuredOrigin;
  }
  return (
    getYourBarrioCanonicalOrigin(detectedOrigin) ||
    detectedOrigin ||
    configuredOrigin ||
    "http://localhost:3000"
  );
}

// All Google OAuth entry points must use this helper. Hand-built callback URLs
// can split hosts from cookies and recreate the "signed in, returned as guest" bug.
export function buildOAuthCallbackUrl({ currentOrigin, next } = {}) {
  const redirectOrigin = getOAuthRedirectOrigin(currentOrigin);
  const callback = new URL("/api/auth/callback", redirectOrigin);
  if (typeof next === "string" && next.trim()) {
    callback.searchParams.set("next", next);
  }
  return callback.toString();
}

export function getOAuthConfigDiagnostics({ currentOrigin } = {}) {
  const detectedOrigin = normalizeOrigin(currentOrigin);
  const configuredSiteUrl = normalizeOrigin(
    process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || ""
  );
  return {
    hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasSupabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    configuredSiteUrl: configuredSiteUrl || null,
    detectedOrigin: detectedOrigin || null,
    redirectOrigin: getOAuthRedirectOrigin(detectedOrigin),
    callbackUrl: buildOAuthCallbackUrl({ currentOrigin: detectedOrigin }),
  };
}

export function logOAuthStart({ provider = "google", redirectTo, currentOrigin } = {}) {
  if (typeof window === "undefined") return;
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_AUTH_DIAG !== "1"
  ) {
    return;
  }
  let host = "";
  try {
    host = new URL(currentOrigin || window.location.origin).host;
  } catch {
    host = window.location.host;
  }
  console.info("[AUTH_OAUTH_START]", {
    provider,
    redirectTo,
    detectedOrigin: currentOrigin || window.location.origin,
    host,
    config: getOAuthConfigDiagnostics({ currentOrigin }),
  });
}
