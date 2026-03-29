"use client";

import { useEffect, useState } from "react";
import FastImage from "@/components/FastImage";
import { Globe, MapPin, Phone, Share2, Star } from "lucide-react";
import BusinessPreviewToolbar from "@/components/publicBusinessProfile/BusinessPreviewToolbar";
import { useTheme } from "@/components/ThemeProvider";
import { getBusinessTypeLabel } from "@/lib/taxonomy/compat";
import {
  getBusinessTypePlaceholder,
  resolveBusinessImageSrc,
} from "@/lib/placeholders/businessPlaceholders";

const ACTION_ICONS = {
  website: Globe,
  phone: Phone,
  directions: MapPin,
};

function normalizeUrl(value) {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `https://${value}`;
}

function buildDirectionsUrl(address, city) {
  const query = [address, city].filter(Boolean).join(", ");
  if (!query) return "";
  return `https://maps.google.com/?q=${encodeURIComponent(query)}`;
}

export default function PublicBusinessHero({
  profile,
  ratingSummary,
  publicPath,
  shell = "public",
}) {
  const { theme, hydrated } = useTheme();
  const isLight = hydrated ? theme === "light" : true;
  const [copied, setCopied] = useState(false);
  const [showSticky, setShowSticky] = useState(false);
  const isCustomerShell = shell === "customer";

  const name =
    profile?.business_name || profile?.full_name || "Local business";
  const businessType = getBusinessTypeLabel(profile, "Neighborhood favorite");
  const city = profile?.city || "";
  const placeholderSrc = getBusinessTypePlaceholder(
    profile?.business_type || profile?.category || null
  );
  const avatarSrc = resolveBusinessImageSrc({
    imageUrl: profile?.profile_photo_url || null,
    businessType: profile?.business_type,
    legacyCategory: profile?.category,
  });
  const coverSrc = resolveBusinessImageSrc({
    imageUrl: profile?.cover_photo_url || null,
    businessType: profile?.business_type,
    legacyCategory: profile?.category,
  });
  const average = ratingSummary?.average || 0;
  const reviewCount = ratingSummary?.count || 0;
  const ratingLabel = reviewCount
    ? `${average.toFixed(1)} - ${reviewCount} review${reviewCount === 1 ? "" : "s"}`
    : "No reviews yet";

  const actions = [];
  if (profile?.website) {
    actions.push({
      key: "website",
      label: "Website",
      href: normalizeUrl(profile.website),
      type: "website",
    });
  }
  if (profile?.phone) {
    actions.push({
      key: "phone",
      label: "Call",
      href: `tel:${profile.phone}`,
      type: "phone",
    });
  }
  const directionsUrl = buildDirectionsUrl(profile?.address, profile?.city);
  if (directionsUrl) {
    actions.push({
      key: "directions",
      label: "Directions",
      href: directionsUrl,
      type: "directions",
    });
  }

  useEffect(() => {
    const handleScroll = () => {
      setShowSticky(window.scrollY > 260);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleShare = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const shareUrl = origin ? new URL(publicPath, origin).toString() : publicPath;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const primaryAction = actions[0];
  const cardText = {
    heading: isLight ? "text-slate-900" : "text-white",
    sub: isLight ? "text-slate-600" : "text-white/70",
    rating: isLight ? "text-slate-700" : "text-white/80",
    action: isLight ? "text-slate-900" : "text-white/90",
    badge: isLight ? "text-slate-600" : "text-white/65",
  };
  const heroShellPadding = isCustomerShell
    ? "mx-auto max-w-6xl px-0 sm:px-6 md:px-10"
    : "mx-auto max-w-6xl px-6 md:px-10";
  const heroCardShellClasses = isCustomerShell
    ? "rounded-none border-0 sm:rounded-t-3xl sm:rounded-b-none sm:border sm:border-white/10"
    : "rounded-t-3xl rounded-b-none border border-white/10";

  return (
    <section className="relative text-white theme-lock">
      {showSticky ? (
        <div className="fixed top-20 inset-x-0 z-40">
          <div className="w-full border-y border-white/10 bg-black/60 backdrop-blur shadow-lg">
            <div className={heroShellPadding}>
              <div className="flex items-center justify-between gap-4 py-2">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full border border-white/20 bg-white/10 overflow-hidden relative">
                    <FastImage
                      src={avatarSrc}
                      alt={`${name} logo`}
                      className="h-full w-full object-cover"
                      fallbackSrc={placeholderSrc}
                      fill
                      sizes="36px"
                      decoding="async"
                    />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{name}</div>
                    <div className="text-xs text-white/70 flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 text-amber-300" fill="currentColor" />
                      {ratingLabel}
                    </div>
                  </div>
                </div>
                {primaryAction ? (
                  <a
                    href={primaryAction.href}
                    target="_blank"
                    rel="noreferrer"
                    className="hidden sm:inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-white transition"
                  >
                    {primaryAction.label}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={handleShare}
                    className="hidden sm:inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-white transition"
                  >
                    {copied ? "Copied link" : "Share"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative h-[170px] sm:h-[200px] md:h-[230px] overflow-hidden">
        <div className="absolute left-0 top-24 w-full z-40 pointer-events-none">
          <BusinessPreviewToolbar className="pointer-events-auto" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900/70 to-black z-0" />
        <FastImage
          src={coverSrc}
          alt={`${name} cover`}
          className="h-full w-full object-cover relative z-0"
          fallbackSrc={placeholderSrc}
          fill
          sizes="100vw"
          priority
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/50 to-black/90 z-0" />
        <div className="pointer-events-none absolute -top-32 -left-24 h-[320px] w-[320px] rounded-full bg-purple-500/30 blur-[140px] z-0" />
        <div className="pointer-events-none absolute top-12 -right-24 h-[320px] w-[320px] rounded-full bg-rose-400/30 blur-[160px] z-0" />
      </div>

      <div className="relative -mt-16 sm:-mt-20">
        <div className={heroShellPadding}>
          <div className={`${heroCardShellClasses} bg-white/5 backdrop-blur-xl p-6 md:p-10 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.7)]`}>
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-4 md:flex-row md:items-center">
                <div className="h-24 w-24 md:h-28 md:w-28 rounded-2xl border border-white/20 bg-white/10 p-2 shadow-xl">
                  <FastImage
                    src={avatarSrc}
                    alt={`${name} logo`}
                    className="h-full w-full rounded-xl object-cover"
                    fallbackSrc={placeholderSrc}
                    width={96}
                    height={96}
                    sizes="(max-width: 768px) 96px, 112px"
                    priority
                    decoding="async"
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <h1 className={`text-3xl md:text-4xl font-bold tracking-tight ${cardText.heading}`}>
                      {name}
                    </h1>
                    <p className={`text-sm md:text-base ${cardText.sub}`}>
                    {businessType}
                    {city ? ` - ${city}` : ""}
                    </p>
                  </div>
                  <div className={`flex items-center gap-2 text-sm ${cardText.rating}`}>
                    <Star className="h-4 w-4 text-amber-300" fill="currentColor" />
                    {ratingLabel}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {actions.map((action) => {
                  const Icon = ACTION_ICONS[action.type];
                  return (
                    <a
                      key={action.key}
                      href={action.href}
                      target="_blank"
                      rel="noreferrer"
                      className={`inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold ${cardText.action} hover:bg-white/20 transition`}
                    >
                      <Icon className="h-4 w-4" />
                      {action.label}
                    </a>
                  );
                })}
                <button
                  type="button"
                  onClick={handleShare}
                  className={`inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold ${cardText.action} hover:bg-white/20 transition`}
                >
                  <Share2 className="h-4 w-4" />
                  {copied ? "Copied" : "Share"}
                </button>
              </div>
            </div>

            <div className={`mt-6 flex flex-wrap items-center gap-3 text-xs ${cardText.badge}`}>
              <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1">
                Local business
              </div>
              {businessType ? (
                <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1">
                  {businessType}
                </div>
              ) : null}
              {city ? (
                <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1">
                  {city}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
