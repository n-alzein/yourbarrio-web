import { ArrowRight } from "lucide-react";
import { redirect } from "next/navigation";
import BusinessAuthPopupLink from "@/components/business/BusinessAuthPopupLink";
import BusinessMarketingHeader from "@/components/headers/BusinessMarketingHeader";
import { getSupabaseServerAuthedClient } from "@/lib/supabaseServer";
import { resolveCurrentUserRoleFromClient } from "@/lib/auth/getCurrentUserRole";
import { BUSINESS_CREATE_PASSWORD_PATH } from "@/lib/auth/businessPasswordGate";
import { PATHS } from "@/lib/auth/paths";
import { isBusinessOnboardingComplete } from "@/lib/business/onboardingCompletion";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BusinessHome() {
  const supabase = await getSupabaseServerAuthedClient();

  if (supabase) {
    const { user, role } = await resolveCurrentUserRoleFromClient(supabase);

    if (user?.id && role === "business") {
      const { data: passwordRow } = await supabase
        .from("users")
        .select("password_set")
        .eq("id", user.id)
        .maybeSingle();

      if (passwordRow?.password_set !== true) {
        redirect(BUSINESS_CREATE_PASSWORD_PATH);
      }

      const { data: businessRow } = await supabase
        .from("businesses")
        .select("business_name,category,address,city,state,postal_code")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (!isBusinessOnboardingComplete(businessRow)) {
        redirect(PATHS.business.onboarding);
      }

      redirect(PATHS.business.dashboard);
    }
  }

  return (
    <>
      <BusinessMarketingHeader />
      <div className="h-16" aria-hidden="true" />
      <div className="min-h-screen bg-white text-slate-900 pt-12 px-6 pb-24">
      <section className="max-w-6xl mx-auto text-center py-12 sm:py-16">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900">
          YourBarrio <span className="text-[var(--color-primary)]">for Business</span>
        </h1>

        <p className="text-lg md:text-2xl text-slate-700 max-w-3xl mx-auto mt-6 leading-relaxed">
          Reach more local customers, grow your visibility, and thrive in your neighborhood.
          YourBarrio helps small businesses stand out in a world dominated by large corporations.
        </p>

        <div className="mt-10 flex flex-col md:flex-row gap-4 justify-center">
          <BusinessAuthPopupLink
            href="/business-auth/register"
            className="px-8 py-4 bg-[var(--color-primary)] text-white font-bold rounded-xl text-lg hover:opacity-90 transition"
          >
            Create a Business Account
          </BusinessAuthPopupLink>

          <BusinessAuthPopupLink
            href="/business-auth/login"
            className="px-8 py-4 border border-[var(--yb-border)] rounded-xl text-lg font-bold text-slate-900 hover:bg-slate-50 transition"
          >
            Business Login
          </BusinessAuthPopupLink>
        </div>
      </section>

      <section
        className="max-w-5xl mx-auto px-6 py-12 sm:py-16 yb-fade-in"
        style={{ contentVisibility: "auto", containIntrinsicSize: "520px" }}
      >
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-8 text-slate-900">
          Our Vision
        </h2>

        <p className="text-slate-700 text-lg leading-relaxed text-center max-w-3xl mx-auto">
          YourBarrio exists to strengthen local communities by helping small businesses
          compete with big-box retailers like Walmart, Target, and Amazon.
          Local businesses bring character, culture, and connection — and they deserve
          modern tools to thrive in the digital age.
        </p>

        <p className="text-slate-700 text-lg leading-relaxed text-center max-w-3xl mx-auto mt-6">
          Whether you&apos;re a restaurant, barber shop, boutique, contractor, or service provider,
          YourBarrio increases your local exposure and connects you directly with nearby customers.
        </p>
      </section>

      <div
        className="max-w-6xl mx-auto px-6 py-12 sm:py-16 grid grid-cols-1 md:grid-cols-3 gap-8"
        style={{ contentVisibility: "auto", containIntrinsicSize: "720px" }}
      >
        <div className="border border-[var(--yb-border)] bg-white p-8 rounded-2xl yb-fade-up">
          <h3 className="text-2xl font-bold mb-4 text-slate-900">
            Increase Local Visibility
          </h3>
          <p className="text-slate-700">
            Your business appears where it matters most — directly in front of people searching
            for what you offer, right in your area.
          </p>
        </div>

        <div
          className="border border-[var(--yb-border)] bg-white p-8 rounded-2xl yb-fade-up"
          style={{ animationDelay: "120ms" }}
        >
          <h3 className="text-2xl font-bold mb-4 text-slate-900">
            Compete With Big Retailers
          </h3>
          <p className="text-slate-700">
            Level the playing field. YourBarrio highlights local businesses,
            helping you attract customers who want to support their community.
          </p>
        </div>

        <div
          className="border border-[var(--yb-border)] bg-white p-8 rounded-2xl yb-fade-up"
          style={{ animationDelay: "220ms" }}
        >
          <h3 className="text-2xl font-bold mb-4 text-slate-900">
            Simple, Modern Tools
          </h3>
          <p className="text-slate-700">
            Manage your business listings, photos, and customer interactions —
            all from one clean, easy-to-use dashboard.
          </p>
        </div>
      </div>

      <section
        className="max-w-3xl mx-auto text-center py-12 sm:py-16 yb-fade-in"
        style={{ animationDelay: "160ms", contentVisibility: "auto", containIntrinsicSize: "360px" }}
      >
        <h2 className="text-3xl md:text-4xl font-semibold mb-4 text-slate-900">
          Start Growing Your Local Reach
        </h2>

        <p className="text-slate-700 text-lg mb-10">
          Create a business account and join the platform designed to help
          your neighborhood discover you.
        </p>

        <BusinessAuthPopupLink
          href="/business-auth/register"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-lg text-white bg-[var(--color-primary)] hover:opacity-90 transition"
        >
          Get Started <ArrowRight className="h-5 w-5" />
        </BusinessAuthPopupLink>
      </section>
      </div>
    </>
  );
}
