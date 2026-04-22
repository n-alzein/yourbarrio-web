import "server-only";

import type { NextRequest } from "next/server";

type HeadersLike = Pick<Headers, "get">;

function firstHeaderValue(value: string | null): string {
  return String(value || "")
    .split(",")[0]
    .trim();
}

function getRequestOriginFromHeaders(headers: HeadersLike): string {
  const proto = firstHeaderValue(headers.get("x-forwarded-proto")) || "https";
  const host =
    firstHeaderValue(headers.get("x-forwarded-host")) ||
    firstHeaderValue(headers.get("host"));

  if (!host) {
    return "http://localhost:3000";
  }

  return `${proto}://${host}`;
}

function toNormalizedUrl(value: string): string | null {
  const input = String(value || "").trim();
  if (!input) return null;
  try {
    return new URL(input).toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function getCanonicalConfiguredSiteUrl(): string | null {
  return (
    toNormalizedUrl(process.env.NEXT_PUBLIC_SITE_URL || "") ||
    toNormalizedUrl(process.env.SITE_URL || "")
  );
}

function shouldForceCanonicalProductionUrl(siteUrl: string): boolean {
  return process.env.NODE_ENV === "production" && siteUrl.toLowerCase().includes("vercel.app");
}

function resolveFinalSiteUrl(fallbackUrl: string): string {
  const canonicalUrl = getCanonicalConfiguredSiteUrl();
  let siteUrl = canonicalUrl || fallbackUrl;

  if (shouldForceCanonicalProductionUrl(siteUrl)) {
    const publicCanonicalUrl = toNormalizedUrl(process.env.NEXT_PUBLIC_SITE_URL || "");
    if (publicCanonicalUrl) {
      console.error("[auth.site-url] refusing_vercel_domain_in_production", {
        node_env: process.env.NODE_ENV,
        resolved_site_url: siteUrl,
        forced_site_url: publicCanonicalUrl,
      });
      siteUrl = publicCanonicalUrl;
    } else {
      console.error("[auth.site-url] vercel_domain_detected_but_no_valid_public_canonical_url", {
        node_env: process.env.NODE_ENV,
        resolved_site_url: siteUrl,
      });
    }
  }

  return siteUrl;
}

export function getSiteUrlFromHeaders(headers: HeadersLike): string {
  const fallbackUrl = getRequestOriginFromHeaders(headers);
  return resolveFinalSiteUrl(fallbackUrl);
}

export function getSiteUrlFromRequest(request: NextRequest): string {
  return getSiteUrlFromHeaders(request.headers);
}
