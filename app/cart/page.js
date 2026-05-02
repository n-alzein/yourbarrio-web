import CartPageClient from "./CartPageClient";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CHECKOUT_INTENT_COOKIE_NAME = "yb_checkout_intent";
const CHECKOUT_INTENT_MAX_AGE_MS = 10 * 60 * 1000;

function normalizeCheckoutRedirectPath(input) {
  if (typeof input !== "string") return null;
  try {
    const parsed = new URL(input, "https://yourbarrio.local");
    if (parsed.pathname !== "/checkout") return null;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

function readCheckoutIntentCookie(value) {
  if (!value) return null;
  try {
    const payload = JSON.parse(decodeURIComponent(value));
    const createdAt = Number(payload?.createdAt || 0);
    if (!createdAt || Date.now() - createdAt > CHECKOUT_INTENT_MAX_AGE_MS) return null;
    return normalizeCheckoutRedirectPath(payload?.redirectTo || "/checkout");
  } catch {
    return null;
  }
}

export default async function CartPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const cookieStore = await cookies();
  const checkoutRedirect = readCheckoutIntentCookie(
    cookieStore.get(CHECKOUT_INTENT_COOKIE_NAME)?.value
  );
  const authHandoffPending =
    resolvedSearchParams?.yb_auth_handoff === "1" ||
    Boolean(resolvedSearchParams?.yb_auth_fresh);

  if (checkoutRedirect) {
    redirect(checkoutRedirect);
  }

  return <CartPageClient suppressEmptyState={authHandoffPending} />;
}
