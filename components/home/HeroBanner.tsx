import Image from "next/image";
import Link from "next/link";

import AnimatedHeroHeadline from "@/components/home/AnimatedHeroHeadline";
import type { HomeHeroConfig } from "@/lib/home/homeHero";

function isExternalHref(href?: string | null) {
  return /^https?:\/\//i.test(href || "");
}

type HeroBannerProps = {
  hero: HomeHeroConfig;
  city?: string | null;
  priority?: boolean;
};

export default function HeroBanner({
  hero,
  city = null,
  priority = false,
}: HeroBannerProps) {
  const title = hero.headline || "Featured";
  const subtitle = hero.subtitle;
  const imageSrc = hero.imageSrc || "";
  const ctaHref = hero.primaryCtaHref || "/";
  const ctaText = hero.primaryCtaLabel || "Explore local businesses";
  const supportingText = hero.supportingText || "Supporting local shops near you";
  const helperText = city?.trim()
    ? `${city.trim()} businesses, curated for you`
    : supportingText;
  const isExternal = isExternalHref(ctaHref);
  const ctaClassName =
    "inline-flex min-h-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7c3aed,#a855f7)] px-5 py-2.5 text-sm font-semibold !text-white shadow-[0_8px_22px_rgba(124,58,237,0.22),0_1px_2px_rgba(15,23,42,0.08)] transition duration-200 hover:-translate-y-0.5 hover:!text-white hover:shadow-[0_12px_28px_rgba(124,58,237,0.28),0_2px_6px_rgba(15,23,42,0.1)] focus-visible:!text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-300/25 active:translate-y-0 active:!text-white sm:text-[0.95rem]";

  return (
    <article className="relative isolate overflow-hidden bg-[#05010d]">
      <div className="relative min-h-[220px] overflow-hidden sm:min-h-[244px] md:min-h-[38vh] lg:min-h-[40vh] xl:min-h-[43vh]">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt={title}
            fill
            className="yb-hero-image object-cover object-center saturate-[1.05] brightness-[1.13] contrast-[0.98]"
            sizes="100vw"
            priority={priority}
            quality={86}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-950 to-black" />
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.42),rgba(0,0,0,0.28))]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(28,20,44,0.13)_0%,rgba(22,17,38,0.21)_42%,rgba(18,15,32,0.28)_100%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,214,170,0.07)_0%,rgba(255,255,255,0.03)_45%,rgba(168,85,247,0.05)_100%)]"
        />
        <div className="relative z-10 flex min-h-[220px] items-center sm:min-h-[244px] md:min-h-[38vh] lg:min-h-[40vh] xl:min-h-[43vh]">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-center px-6 pb-5 pt-7 sm:pb-6 sm:pt-8 md:px-8 md:pb-6 md:pt-7 lg:pb-6 lg:pt-7">
            <div className="yb-fade-up mx-auto flex max-w-[40rem] flex-col items-center text-center [animation-delay:120ms] motion-reduce:[animation-delay:0ms]">
              <h1 className="max-w-[17.2ch] text-[2rem] font-bold tracking-[-0.04em] text-[#ffffff] [text-shadow:0_2px_8px_rgba(0,0,0,0.22)] sm:max-w-[17.8ch] sm:text-[2.45rem] sm:leading-[1.03] lg:max-w-[18.8ch] lg:text-[3.15rem] lg:leading-[1.01]">
                <AnimatedHeroHeadline supportingText={title} />
              </h1>
              {subtitle ? (
                <p className="mt-4 max-w-[34rem] text-sm leading-6 text-[rgba(255,255,255,0.85)] sm:text-base sm:leading-7 lg:text-[1.0625rem] lg:leading-7">
                  {subtitle}
                </p>
              ) : null}

              <div className="yb-fade-up mt-3 [animation-delay:220ms] motion-reduce:[animation-delay:0ms]">
                {isExternal ? (
                  <a
                    href={ctaHref}
                    target="_blank"
                    rel="noreferrer"
                    className={ctaClassName}
                  >
                    {ctaText}
                  </a>
                ) : (
                  <Link
                    href={ctaHref}
                    prefetch={false}
                    className={ctaClassName}
                  >
                    {ctaText}
                  </Link>
                )}
              </div>

              <div className="yb-fade-up mt-3 flex items-center gap-2 text-sm text-[rgba(255,255,255,0.74)] [animation-delay:320ms] motion-reduce:[animation-delay:0ms]">
                <span className="inline-flex h-4 w-4 items-center justify-center">
                  <Image
                    src="/YBpin.png"
                    alt=""
                    aria-hidden="true"
                    width={16}
                    height={16}
                    className="h-4 w-4 object-contain opacity-80"
                  />
                </span>
                <p>{helperText}</p>
              </div>
            </div>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent via-[rgba(252,252,253,0.08)] to-[rgba(252,252,253,0.72)] sm:h-12"
        />
      </div>
    </article>
  );
}
