import { redirect } from "next/navigation";
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
  const supabase = await getSupabaseServerAuthedClient();
  const pathname = BUSINESS_CREATE_PASSWORD_PATH;

  if (!supabase) {
    const decision = getBusinessCreatePasswordAccessDecision({
      hasSession: false,
    });
    logBusinessRedirectTrace("create_password_page", {
      pathname,
      userId: null,
      role: null,
      sessionExists: false,
      password_set: null,
      onboardingState: null,
      redirectDestination: decision.destination,
      redirectReason: decision.reason,
    });
    redirect(decision.destination);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    const decision = getBusinessCreatePasswordAccessDecision({
      hasSession: false,
    });
    logBusinessRedirectTrace("create_password_page", {
      pathname,
      userId: null,
      role: null,
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
      pathname,
      userId: user.id,
      role: businessGate.role,
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
    pathname,
    userId: user.id,
    role: businessGate.role,
    sessionExists: true,
    password_set: businessGate.passwordSet,
    onboardingState: businessGate.onboardingComplete,
    redirectDestination: null,
    redirectReason: decision.reason,
    accountStatus: businessGate.accountStatus,
  });

  return <BusinessCreatePasswordClient />;
}
