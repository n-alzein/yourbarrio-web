import {
  ArrowRight,
  LayoutDashboard,
  MapPinned,
  Store,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import BusinessAuthPopupLink from "@/components/business/BusinessAuthPopupLink";
import BusinessHeroHeaderActions from "@/components/business/BusinessHeroHeaderActions";
import { getSupabaseServerAuthedClient } from "@/lib/supabaseServer";
import { resolveCurrentUserRoleFromClient } from "@/lib/auth/getCurrentUserRole";
import { BUSINESS_CREATE_PASSWORD_PATH } from "@/lib/auth/businessPasswordGate";
import { PATHS } from "@/lib/auth/paths";
import { isBusinessOnboardingComplete } from "@/lib/business/onboardingCompletion";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALUE_POINTS = [
  {
    title: "Reach nearby customers",
    description: "Get discovered by people already searching close to where you do business.",
    Icon: MapPinned,
  },
  {
    title: "Build a credible local presence",
    description: "Present your business with a storefront that feels clear, polished, and trustworthy.",
    Icon: Store,
  },
  {
    title: "Manage everything simply",
    description: "Keep your profile, listings, and visibility in one place without extra complexity.",
    Icon: LayoutDashboard,
  },
];

const STEPS = [
  {
    step: "01",
    title: "Create your business account",
    description: "Set up your account and unlock YourBarrio’s business tools.",
  },
  {
    step: "02",
    title: "Build your storefront",
    description: "Add your details, photos, services, and what makes your business worth choosing.",
  },
  {
    step: "03",
    title: "Publish what you offer",
    description: "List products or services so nearby customers can understand what you do at a glance.",
  },
  {
    step: "04",
    title: "Reach local customers",
    description: "Show up with a stronger local presence in the neighborhoods you actually serve.",
  },
];

const HERO_VISUAL_SRC = "/business_transaction.png";

function SectionHeading({ eyebrow, title, body }) {
  return (
    <div className="max-w-2xl">
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7c3aed]">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-[2.2rem]">
        {title}
      </h2>
      {body ? <p className="mt-4 text-base leading-7 text-slate-600">{body}</p> : null}
    </div>
  );
}

function BusinessPreviewPanel() {
  return (
    <div className="mx-auto w-full max-w-[35rem] lg:mr-0 lg:max-w-[39.9rem]">
      <div className="overflow-hidden rounded-[12px] bg-white/35">
        <Image
          src={HERO_VISUAL_SRC}
          alt="YourBarrio for Business storefront preview"
          width={1200}
          height={900}
          priority
          className="h-auto w-full object-cover"
          sizes="(max-width: 1024px) 100vw, 608px"
        />
      </div>
    </div>
  );
}

function BusinessHeroHeader() {
  return (
    <header
      className="fixed inset-x-0 top-0 z-50"
      style={{
        backgroundColor: "#0F172A",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="mx-auto flex h-20 w-full max-w-[1280px] items-center justify-between gap-5 px-4 sm:px-6 lg:px-8">
        <Link href="/business" prefetch={false} className="flex shrink-0 items-center">
          <span className="relative block h-12 w-12 md:hidden">
            <Image
              src="/business-placeholder2.png"
              alt="YourBarrio Logo"
              fill
              sizes="48px"
              priority
              className="object-contain"
            />
          </span>
          <span className="relative hidden h-[3.3rem] w-[3.3rem] md:block md:h-[9.8rem] md:w-[9.8rem]">
            <Image
              src="/logo.png"
              alt="YourBarrio Logo"
              fill
              sizes="157px"
              priority
              className="object-contain"
            />
          </span>
        </Link>

        <BusinessHeroHeaderActions />
      </div>
    </header>
  );
}

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
      <BusinessHeroHeader />
      <div className="h-[74px]" aria-hidden="true" />

      <main className="relative overflow-hidden bg-[linear-gradient(180deg,#fcfbf9_0%,#f8f3ec_42%,#ffffff_100%)] text-slate-900">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[18rem] bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.06),transparent_38%)]" />

        <section className="relative px-6 pb-14 pt-12 md:px-8 md:pb-16 md:pt-16">
          <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] lg:items-center lg:gap-9">
            <div className="max-w-[32rem]">
              <p className="inline-flex items-center rounded-full border border-[#7c3aed]/16 bg-[#7c3aed]/[0.05] px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#6d28d9]">
                For Local Businesses
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.06em] text-slate-950 sm:text-[3.2rem] sm:leading-[0.98] lg:text-[4rem]">
                Help your neighborhood discover your business first.
              </h1>
              <p className="mt-4 max-w-md text-base leading-7 text-slate-600">
                Get discovered by customers already searching nearby.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <BusinessAuthPopupLink
                  href="/business-auth/register"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7c3aed,#8b33ea)] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_22px_-18px_rgba(124,58,237,0.26)] transition duration-200 hover:-translate-y-0.5"
                >
                  Create a business account
                </BusinessAuthPopupLink>
                <BusinessAuthPopupLink
                  href="/business/login"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white/88 px-6 py-3 text-sm font-semibold text-slate-800 transition duration-200 hover:bg-white"
                >
                  Business login
                </BusinessAuthPopupLink>
              </div>

              <p className="mt-5 text-sm leading-6 text-slate-600">
                Built for local visibility and simple business tools.
              </p>
            </div>

            <BusinessPreviewPanel />
          </div>
        </section>

        <section className="px-6 py-16 md:px-8 md:py-18">
          <div className="mx-auto w-full max-w-6xl">
            <SectionHeading
              eyebrow="Core value"
              title="Everything you need to show up locally without extra complexity."
              body="Three clear reasons businesses use YourBarrio to strengthen their neighborhood presence."
            />

            <div className="mt-10 grid gap-8 md:grid-cols-3">
              {VALUE_POINTS.map(({ title, description, Icon }) => (
                <div key={title} className="max-w-sm">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#7c3aed]/10 text-[#7c3aed]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="mt-5 text-xl font-semibold tracking-[-0.035em] text-slate-950">{title}</h2>
                  <p className="mt-3 text-[0.98rem] leading-7 text-slate-600">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-16 md:px-8 md:py-18">
          <div className="mx-auto w-full max-w-6xl">
            <SectionHeading
              eyebrow="How it works"
              title="A simple path from setup to local discovery."
              body="The workflow stays clear so you can focus on your business, not on learning a complicated platform."
            />

            <div className="mt-10 grid gap-4 lg:grid-cols-4">
              {STEPS.map((item) => (
                <div
                  key={item.step}
                  className="rounded-[24px] border border-slate-200/75 bg-white/78 p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.16)]"
                >
                  <div className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7c3aed]">
                    {item.step}
                  </div>
                  <h3 className="mt-4 text-[1.05rem] font-semibold tracking-[-0.03em] text-slate-950">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 pb-16 pt-8 md:px-8 md:pb-20">
          <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-[30px] border border-[#d9c6ff]/35 bg-[linear-gradient(135deg,rgba(247,240,255,0.96),rgba(242,236,251,0.98))] p-8 text-center shadow-[0_24px_70px_-48px_rgba(124,58,237,0.26)] md:p-10">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#6d28d9]">
              Get started
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-[2.2rem]">
              Build a stronger local presence with YourBarrio.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600">
              Give nearby customers a clearer reason to discover, trust, and choose your business.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <BusinessAuthPopupLink
                href="/business-auth/register"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#7c3aed,#9333ea)] px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_34px_-16px_rgba(124,58,237,0.34)] transition duration-200 hover:-translate-y-0.5"
              >
                Get started <ArrowRight className="h-4 w-4" />
              </BusinessAuthPopupLink>
              <BusinessAuthPopupLink
                href="/business/login"
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-300/90 bg-white/92 px-6 py-3 text-sm font-semibold text-slate-800 transition duration-200 hover:bg-white"
              >
                Business login
              </BusinessAuthPopupLink>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
