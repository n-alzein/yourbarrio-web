import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import OnboardingClient from "./OnboardingClient";
import { getSupabaseServerAuthedClient } from "@/lib/supabaseServer";
import { resolveCurrentUserRoleFromClient } from "@/lib/auth/getCurrentUserRole";
import {
  getOnboardingAccess,
  isDocumentNavigationFromHeaders,
} from "@/lib/auth/onboardingAccess";

const NEXT_ONBOARDING = "/onboarding";

function redirectForRole(role) {
  if (role === "admin") return "/admin";
  if (role === "customer") return "/customer/home";
  return `/signin?modal=signin&next=${encodeURIComponent(NEXT_ONBOARDING)}`;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OnboardingPage() {
  const headerList = await headers();
  const isDocumentNav = isDocumentNavigationFromHeaders(headerList);
  const supabase = await getSupabaseServerAuthedClient();

  if (!supabase) {
    if (isDocumentNav) {
      redirect(`/signin?modal=signin&next=${encodeURIComponent(NEXT_ONBOARDING)}`);
    }
    notFound();
  }

  const { user, role } = await resolveCurrentUserRoleFromClient(supabase);

  if (!user) {
    if (isDocumentNav) {
      redirect(`/signin?modal=signin&next=${encodeURIComponent(NEXT_ONBOARDING)}`);
    }
    notFound();
  }

  if (role !== "business") {
    if (isDocumentNav) {
      redirect(redirectForRole(role));
    }
    notFound();
  }

  const { hasBusinessRow } = await getOnboardingAccess(supabase, user.id);
  if (hasBusinessRow) {
    if (isDocumentNav) {
      redirect("/business/dashboard");
    }
    notFound();
  }

  return <OnboardingClient />;
}
