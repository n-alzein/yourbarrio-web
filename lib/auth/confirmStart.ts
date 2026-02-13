import "server-only";
import { getSafeRedirectPath } from "@/lib/auth/redirects";

export function buildConfirmStartUrl(
  tokenHash: string,
  type: "recovery" | "invite" | "email" | "email_change" = "recovery",
  next = "/set-password",
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
) {
  const safeNext = getSafeRedirectPath(next) || "/set-password";
  const targetUrl = new URL("/set-password", siteUrl);
  targetUrl.searchParams.set("token_hash", tokenHash);
  targetUrl.searchParams.set("type", type);
  if (safeNext && safeNext !== "/set-password") {
    targetUrl.searchParams.set("next", safeNext);
  }
  return targetUrl.toString();
}
