import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import BusinessCreatePasswordClient from "@/components/business-auth/BusinessCreatePasswordClient";
import {
  BUSINESS_CREATE_PASSWORD_PATH,
  getBusinessCreatePasswordAccessDecision,
  getBusinessPasswordGateState,
  logBusinessRedirectTrace,
} from "@/lib/auth/businessPasswordGate";
import { ensureBusinessProvisionedForUser } from "@/lib/auth/ensureBusinessProvisioning";
import { getSupabaseServerAuthedClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BusinessCreatePasswordPage() {
  const headerList = await headers();
  const cookieStore = await cookies();
  const supabase = await getSupabaseServerAuthedClient();
  const host = headerList.get("host") || null;
  const pathname = BUSINESS_CREATE_PASSWORD_PATH;
  const rawCookieNames = cookieStore.getAll().map((cookie) => cookie.name);

  if (!supabase) {
    const decision = getBusinessCreatePasswordAccessDecision({
      hasSession: false,
    });
    logBusinessRedirectTrace("create_password_page", {
      host,
      pathname,
      rawCookieNames,
      userId: null,
      role: null,
      serverCanReadSession: false,
      serverCanReadUser: false,
      sessionExists: false,
      password_set: null,
      onboardingState: null,
      redirectDestination: decision.destination,
      redirectReason: decision.reason,
    });
    redirect(decision.destination);
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    const decision = getBusinessCreatePasswordAccessDecision({
      hasSession: false,
    });
    logBusinessRedirectTrace("create_password_page", {
      host,
      pathname,
      rawCookieNames,
      userId: null,
      role: null,
      serverCanReadSession: Boolean(session),
      serverCanReadUser: false,
      sessionExists: false,
      password_set: null,
      onboardingState: null,
      redirectDestination: decision.destination,
      redirectReason: decision.reason,
    });
    redirect(decision.destination);
  }

  const fallbackRole =
    user.app_metadata?.role || user.user_metadata?.role || null;

  if (fallbackRole === "business") {
    await ensureBusinessProvisionedForUser({
      userId: user.id,
      email: user.email || "",
      source: "business_create_password_page",
    });
  }

  const businessGate = await getBusinessPasswordGateState({
    supabase,
    userId: user.id,
    fallbackRole,
  });

  const decision = getBusinessCreatePasswordAccessDecision({
    hasSession: true,
    role: businessGate.role,
    passwordSet: businessGate.passwordSet,
    onboardingComplete: businessGate.onboardingComplete,
  });

  if (decision.action === "redirect") {
    logBusinessRedirectTrace("create_password_page", {
      host,
      pathname,
      rawCookieNames,
      userId: user.id,
      role: businessGate.role,
      serverCanReadSession: Boolean(session),
      serverCanReadUser: true,
      sessionExists: true,
      password_set: businessGate.passwordSet,
      onboardingState: businessGate.onboardingComplete,
      redirectDestination: decision.destination,
      redirectReason: decision.reason,
      accountStatus: businessGate.accountStatus,
    });
    redirect(decision.destination);
  }

  logBusinessRedirectTrace("create_password_page", {
    host,
    pathname,
    rawCookieNames,
    userId: user.id,
    role: businessGate.role,
    serverCanReadSession: Boolean(session),
    serverCanReadUser: true,
    sessionExists: true,
    password_set: businessGate.passwordSet,
    onboardingState: businessGate.onboardingComplete,
    redirectDestination: null,
    redirectReason: decision.reason,
    accountStatus: businessGate.accountStatus,
  });

  return <BusinessCreatePasswordClient />;
}
