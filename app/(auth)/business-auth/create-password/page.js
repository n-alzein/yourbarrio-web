import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import BusinessCreatePasswordClient from "@/components/business-auth/BusinessCreatePasswordClient";
import {
  BUSINESS_CREATE_PASSWORD_PATH,
  getBusinessAuthCookieNames,
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
  const authCookieNames = getBusinessAuthCookieNames(cookieStore.getAll());
  const hasAuthCookies = authCookieNames.length > 0;

  if (!supabase) {
    const decision = getBusinessCreatePasswordAccessDecision({
      hasSession: false,
    });
    logBusinessRedirectTrace("create_password_page", {
      host,
      pathname,
      authCookieNames,
      userPresent: false,
      role: null,
      businessRowFound: null,
      serverCanReadSession: false,
      serverCanReadUser: false,
      sessionExists: false,
      getSessionReturnedSession: false,
      getUserReturnedUser: false,
      password_set: null,
      onboardingState: null,
      shouldAwaitBrowserSession: false,
      renderAllowed: false,
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
    const shouldAwaitBrowserSession = hasAuthCookies;
    const decision = shouldAwaitBrowserSession
      ? {
          action: "render",
          destination: null,
          reason: "await_browser_session_resolution",
        }
      : getBusinessCreatePasswordAccessDecision({
          hasSession: false,
        });
    logBusinessRedirectTrace("create_password_page", {
      host,
      pathname,
      authCookieNames,
      userPresent: false,
      role: null,
      businessRowFound: null,
      serverCanReadSession: Boolean(session),
      serverCanReadUser: false,
      sessionExists: false,
      getSessionReturnedSession: Boolean(session),
      getUserReturnedUser: false,
      password_set: null,
      onboardingState: null,
      shouldAwaitBrowserSession,
      renderAllowed: decision.action === "render",
      redirectDestination: decision.destination,
      redirectReason: decision.reason,
    });
    if (decision.action === "redirect") {
      redirect(decision.destination);
    }

    return <BusinessCreatePasswordClient awaitSessionResolution />;
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
    fallbackRole,
    passwordSet: businessGate.passwordSet,
    onboardingComplete: businessGate.onboardingComplete,
    businessRow: businessGate.businessRow,
  });
  const renderAllowed = decision.action === "render";

  if (decision.action === "redirect") {
    logBusinessRedirectTrace("create_password_page", {
      host,
      pathname,
      authCookieNames,
      userPresent: true,
      role: businessGate.role,
      businessRowFound: Boolean(businessGate.businessRow?.owner_user_id),
      serverCanReadSession: Boolean(session),
      serverCanReadUser: true,
      sessionExists: true,
      getSessionReturnedSession: Boolean(session),
      getUserReturnedUser: true,
      password_set: businessGate.passwordSet,
      onboardingState: businessGate.onboardingComplete,
      shouldAwaitBrowserSession: false,
      renderAllowed,
      redirectDestination: decision.destination,
      redirectReason: decision.reason,
      accountStatus: businessGate.accountStatus,
    });
    redirect(decision.destination);
  }

  logBusinessRedirectTrace("create_password_page", {
    host,
    pathname,
    authCookieNames,
    userPresent: true,
    role: businessGate.role,
    businessRowFound: Boolean(businessGate.businessRow?.owner_user_id),
    serverCanReadSession: Boolean(session),
    serverCanReadUser: true,
    sessionExists: true,
    getSessionReturnedSession: Boolean(session),
    getUserReturnedUser: true,
    password_set: businessGate.passwordSet,
    onboardingState: businessGate.onboardingComplete,
    shouldAwaitBrowserSession: false,
    renderAllowed,
    redirectDestination: null,
    redirectReason: decision.reason,
    accountStatus: businessGate.accountStatus,
  });

  return <BusinessCreatePasswordClient awaitSessionResolution={false} />;
}
