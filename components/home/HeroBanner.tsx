import Image from "next/image";
import { MapPin } from "lucide-react";

type HeroBannerProps = {
  banner: any;
  imageUrl?: string | null;
  locationName?: string | null;
  priority?: boolean;
};

function isExternalHref(href?: string | null) {
  return /^https?:\/\//i.test(href || "");
}

function normalizeLocationName(value?: string | null) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

export default function HeroBanner({
  banner,
  imageUrl,
  locationName,
  priority = false,
}: HeroBannerProps) {
  const title = banner?.title || "Featured";
  const subtitle = banner?.subtitle;
  const ctaHref = banner?.ctaURL || "/";
  const ctaText = banner?.ctaText || "Explore local businesses";
  const safeLocationName = normalizeLocationName(locationName);
  const trustLine = safeLocationName
    ? `Supporting local shops in ${safeLocationName}`
    : "Supporting local shops near you";
  const ctaProps = isExternalHref(ctaHref)
    ? { target: "_blank", rel: "noreferrer" as const }
    : {};

  return (
    <article className="relative isolate overflow-hidden bg-[#05010d]">
      <div className="relative min-h-[360px] overflow-hidden sm:min-h-[420px] lg:min-h-[460px]">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            fill
            className="yb-hero-image object-cover object-center saturate-[1.04] brightness-[1.03] contrast-[1.03]"
            sizes="100vw"
            priority={priority}
            quality={86}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-950 to-black" />
        )}
        <div aria-hidden="true" className="absolute inset-0 bg-[rgba(0,0,0,0.25)]" />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.25)_0%,rgba(0,0,0,0.45)_100%)]"
        />
        <div className="relative z-10 flex min-h-[360px] items-center sm:min-h-[420px] lg:min-h-[460px]">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-center px-5 pb-12 pt-14 sm:px-6 sm:pb-14 sm:pt-16 md:px-8 lg:px-12 lg:pb-16 lg:pt-16">
            <div className="yb-fade-up mx-auto flex max-w-[40rem] flex-col items-center text-center [animation-delay:120ms] motion-reduce:[animation-delay:0ms]">
              <h1 className="max-w-[12ch] text-[2rem] font-bold tracking-[-0.04em] text-[#ffffff] [text-shadow:0_2px_10px_rgba(0,0,0,0.4)] sm:text-[2.5rem] sm:leading-[1.05] lg:text-[3.25rem] lg:leading-[1.02]">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-4 max-w-[34rem] text-sm leading-6 text-[rgba(255,255,255,0.85)] sm:text-base sm:leading-7 lg:text-[1.0625rem] lg:leading-7">
                  {subtitle}
                </p>
              ) : null}

              <div className="yb-fade-up mt-6 [animation-delay:220ms] motion-reduce:[animation-delay:0ms]">
                <a
                  href={ctaHref}
                  {...ctaProps}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7c3aed,#a855f7)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(124,58,237,0.24)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(124,58,237,0.3)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-300/25 active:translate-y-0 sm:text-[0.95rem]"
                >
                  {ctaText}
                </a>
              </div>

              <div className="yb-fade-up mt-5 flex items-center gap-2.5 text-sm text-[rgba(255,255,255,0.7)] [animation-delay:320ms] motion-reduce:[animation-delay:0ms]">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/15">
                  <MapPin className="h-3.5 w-3.5 text-purple-200" aria-hidden="true" />
                </span>
                <p>{trustLine}</p>
              </div>
            </div>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent via-[rgba(248,244,238,0.05)] to-[rgba(248,244,238,0.22)]"
        />
      </div>
    </article>
  );
}
