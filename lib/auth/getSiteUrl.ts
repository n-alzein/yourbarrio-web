import "server-only";

import type { NextRequest } from "next/server";

function firstHeaderValue(value: string | null): string {
  return String(value || "")
    .split(",")[0]
    .trim();
}

function getRequestOriginFromHeaders(headers: Headers): string {
  const proto = firstHeaderValue(headers.get("x-forwarded-proto")) || "http";
  const host =
    firstHeaderValue(headers.get("x-forwarded-host")) ||
    firstHeaderValue(headers.get("host"));

  if (!host) {
    return "http://localhost:3000";
  }

  return `${proto}://${host}`;
}

function getValidConfiguredSiteUrl(): string | null {
  const configured = String(process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (!configured) return null;
  try {
    return new URL(configured).toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function getSiteUrlFromRequest(request: NextRequest): string {
  const requestOrigin = getRequestOriginFromHeaders(request.headers);

  if (process.env.NODE_ENV !== "production") {
    return requestOrigin;
  }

  const configured = getValidConfiguredSiteUrl();
  if (configured) {
    return configured;
  }

  const vercelUrl = String(process.env.NEXT_PUBLIC_VERCEL_URL || "").trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  }

  return requestOrigin;
}
