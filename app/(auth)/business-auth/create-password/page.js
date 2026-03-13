import { redirect } from "next/navigation";
import BusinessCreatePasswordClient from "@/components/business-auth/BusinessCreatePasswordClient";
import {
  BUSINESS_CREATE_PASSWORD_PATH,
  getBusinessPasswordGateState,
  getBusinessRedirectDestination,
} from "@/lib/auth/businessPasswordGate";
import { ensureBusinessProvisionedForUser } from "@/lib/auth/ensureBusinessProvisioning";
import { getSupabaseServerAuthedClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BusinessCreatePasswordPage() {
  const supabase = await getSupabaseServerAuthedClient();

  if (!supabase) {
    redirect(`/business-auth/login?next=${encodeURIComponent(BUSINESS_CREATE_PASSWORD_PATH)}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    redirect(`/business-auth/login?next=${encodeURIComponent(BUSINESS_CREATE_PASSWORD_PATH)}`);
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

  if (businessGate.role !== "business") {
    redirect("/");
  }

  if (businessGate.passwordSet) {
    redirect(
      getBusinessRedirectDestination({
        passwordSet: businessGate.passwordSet,
        onboardingComplete: businessGate.onboardingComplete,
      })
    );
  }

  return <BusinessCreatePasswordClient />;
}
