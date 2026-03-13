import { redirect } from "next/navigation";
import OnboardingClient from "@/app/(onboarding)/onboarding/OnboardingClient";
import { getSupabaseServerAuthedClient } from "@/lib/supabaseServer";
import { resolveCurrentUserRoleFromClient } from "@/lib/auth/getCurrentUserRole";
import { BUSINESS_CREATE_PASSWORD_PATH } from "@/lib/auth/businessPasswordGate";
import { isBusinessOnboardingComplete } from "@/lib/business/onboardingCompletion";

const NEXT_ONBOARDING = "/onboarding";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OnboardingPage() {
  const supabase = await getSupabaseServerAuthedClient();

  if (!supabase) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ONBOARDING_REDIRECT_TRACE] source=onboarding_page_no_supabase", {
        pathname: NEXT_ONBOARDING,
      });
    }
    redirect(`/business-auth/login?next=${encodeURIComponent(NEXT_ONBOARDING)}`);
  }

  const { user, role } = await resolveCurrentUserRoleFromClient(supabase);

  if (!user) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ONBOARDING_REDIRECT_TRACE] source=onboarding_page_unauthenticated", {
        pathname: NEXT_ONBOARDING,
        role: role || null,
      });
    }
    redirect(`/business-auth/login?next=${encodeURIComponent(NEXT_ONBOARDING)}`);
  }

  if (role === "business") {
    const { data: passwordRow } = await supabase
      .from("users")
      .select("password_set")
      .eq("id", user.id)
      .maybeSingle();

    if (passwordRow?.password_set !== true) {
      redirect(BUSINESS_CREATE_PASSWORD_PATH);
    }
  }

  const { data: businessRow, error: businessError } = await supabase
    .from("businesses")
    .select("owner_user_id,business_name,category,address,city,state,postal_code")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (businessError) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ONBOARDING_REDIRECT_TRACE] source=onboarding_guard_error", {
        userId: user.id,
        role: role || null,
        code: businessError.code || null,
        message: businessError.message || null,
      });
    }
  }

  if (isBusinessOnboardingComplete(businessRow)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ONBOARDING_REDIRECT_TRACE] source=onboarding_complete_redirect", {
        userId: user.id,
        role: role || null,
        destination: "/business/dashboard",
      });
    }
    redirect("/business/dashboard");
  }

  return <OnboardingClient />;
}
