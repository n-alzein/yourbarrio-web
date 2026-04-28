import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import BusinessAuthPopupLink from "@/components/business/BusinessAuthPopupLink";
import BusinessHeroHeaderActions from "@/components/business/BusinessHeroHeaderActions";
import { getSupabaseServerAuthedClient } from "@/lib/supabaseServer";
import { resolveCurrentUserRoleFromClient } from "@/lib/auth/resolveCurrentUserRoleFromClient";
import { BUSINESS_CREATE_PASSWORD_PATH } from "@/lib/auth/businessPasswordGate";
import { PATHS } from "@/lib/auth/paths";
import { isBusinessOnboardingComplete } from "@/lib/business/onboardingCompletion";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALUE_POINTS = [
  {
    title: "Reach nearby customers",
    description: "Get discovered by people already searching close to where you do business.",
    image: "/images/business-values/reach-nearby-customers.png",
    alt: "A customer browsing a refined local boutique storefront in warm natural light.",
    objectPosition: "object-center",
  },
  {
    title: "Build a credible local presence",
    description: "Present your business with a storefront that feels clear, polished, and trustworthy.",
    image: "/images/business-values/credible-local-presence.png",
    alt: "A business owner carefully arranging a polished storefront or product display.",
    objectPosition: "object-[center_44%]",
  },
  {
    title: "Manage everything simply",
    description: "Keep your profile, listings, and visibility in one place without extra complexity.",
    image: "/images/business-values/manage-everything-simply.png",
    alt: "A business owner using a laptop in a clean shop workspace with calm natural light.",
    objectPosition: "object-[center_38%]",
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
      <div className="yb-business-polish-transition overflow-hidden rounded-[26px] border border-white/55 bg-white/45 shadow-[var(--yb-business-shadow-soft)]">
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

function BusinessValueCard({ title, description, image, alt, objectPosition }) {
  return (
    <article className="group yb-business-polish-transition mx-auto flex w-full max-w-[23.5rem] flex-col group-hover:-translate-y-0.5 md:mx-0">
      <div className="mx-auto w-full overflow-hidden rounded-[26px] bg-[#f3ede6] shadow-[var(--yb-business-shadow-soft)] yb-business-polish-transition group-hover:shadow-[var(--yb-business-shadow-hover)]">
        <div className="relative aspect-[4/3] overflow-hidden md:min-h-[18.5rem]">
          <Image
            src={image}
            alt={alt}
            fill
            className={`h-full w-full object-cover ${objectPosition} yb-business-polish-transition group-hover:scale-[1.02]`}
            sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 360px"
          />
        </div>
      </div>
      <h3 className="mt-5 max-w-[17.5rem] text-[1.1rem] font-semibold tracking-[-0.03em] text-slate-950">
        {title}
      </h3>
      <p className="mt-2.5 max-w-[20rem] text-[0.95rem] leading-6 text-slate-600">{description}</p>
    </article>
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

      <main className="yb-business-marketing relative overflow-hidden bg-[linear-gradient(180deg,#fcfbf9_0%,#f8f3ec_42%,#ffffff_100%)] text-slate-900">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[18rem] bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.06),transparent_38%)]" />

        <section className="relative px-6 pb-14 pt-12 md:px-8 md:pb-16 md:pt-16">
          <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] lg:items-center lg:gap-9">
            <div className="max-w-[32rem]">
              <p className="inline-flex items-center rounded-full border border-[#7c3aed]/16 bg-[#7c3aed]/[0.05] px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#6d28d9]">
                For Local Businesses
              </p>
              <h1 className="mt-3.5 text-4xl font-semibold tracking-[-0.06em] text-slate-950 sm:text-[3.2rem] sm:leading-[0.98] lg:text-[4rem]">
                Be the first business your neighborhood discovers.
              </h1>
              <p className="mt-3 max-w-md text-base leading-7 text-slate-600">
                Get discovered by customers already searching nearby.
              </p>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <BusinessAuthPopupLink
                  href="/business-auth/register"
                  className="yb-auth-cta inline-flex min-h-12 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7c3aed,#8b33ea)] px-6 py-3 text-sm font-semibold text-white hover:bg-[linear-gradient(135deg,#6d28d9,#7e22ce)] hover:text-white active:bg-[linear-gradient(135deg,#5b21b6,#6b21a8)] active:text-white shadow-[0_10px_24px_-18px_rgba(124,58,237,0.34)] yb-business-polish-transition hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-22px_rgba(124,58,237,0.42)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed] focus-visible:ring-offset-2"
                >
                  Create a business account
                </BusinessAuthPopupLink>
                <BusinessAuthPopupLink
                  href="/business/login"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white/88 px-6 py-3 text-sm font-semibold text-slate-800 yb-business-polish-transition hover:border-slate-400 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                >
                  Business login
                </BusinessAuthPopupLink>
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-600">
                Built for local visibility and simple business tools.
              </p>
            </div>

            <BusinessPreviewPanel />
          </div>
        </section>

        <section className="px-6 pb-14 pt-20 md:px-8 md:pb-16 md:pt-24">
          <div className="mx-auto w-full max-w-[76rem]">
            <SectionHeading
              eyebrow="Core value"
              title="Everything you need to show up locally without extra complexity."
              body="Three clear reasons businesses use YourBarrio to strengthen their neighborhood presence."
            />

            <div className="mt-16 grid gap-x-10 gap-y-12 md:grid-cols-3 lg:gap-x-14">
              {VALUE_POINTS.map(({ title, description, image, alt, objectPosition }) => (
                <BusinessValueCard
                  key={title}
                  title={title}
                  description={description}
                  image={image}
                  alt={alt}
                  objectPosition={objectPosition}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 pb-16 pt-4 md:px-8 md:pb-20 md:pt-6">
          <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-[30px] border border-[#d9c6ff]/30 bg-[linear-gradient(135deg,rgba(249,244,255,0.98),rgba(244,240,251,0.96)_48%,rgba(239,243,252,0.94))] p-8 text-center shadow-[0_24px_70px_-48px_rgba(15,23,42,0.18)] md:p-10">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#6d28d9]">
              Get started
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-[2.2rem]">
              Build a stronger local presence with YourBarrio.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600">
              Give nearby customers a clearer reason to discover, trust, and choose your business.
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <BusinessAuthPopupLink
                href="/business-auth/register"
                className="yb-auth-cta inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#7c3aed,#9333ea)] px-6 py-3 text-sm font-semibold text-white hover:bg-[linear-gradient(135deg,#6d28d9,#7e22ce)] hover:text-white active:bg-[linear-gradient(135deg,#5b21b6,#6b21a8)] active:text-white shadow-[0_14px_34px_-16px_rgba(124,58,237,0.34)] yb-business-polish-transition hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-20px_rgba(124,58,237,0.38)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed] focus-visible:ring-offset-2"
              >
                Get started <ArrowRight className="h-4 w-4" />
              </BusinessAuthPopupLink>
              <BusinessAuthPopupLink
                href="/business/login"
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-300/90 bg-white/92 px-6 py-3 text-sm font-semibold text-slate-800 yb-business-polish-transition hover:border-slate-400 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
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
