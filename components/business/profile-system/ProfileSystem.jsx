"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import FastImage from "@/components/FastImage";
import { cx } from "@/lib/utils/cx";
import {
  Clock3,
  Globe,
  MapPin,
  Pencil,
  Phone,
  Share2,
  Star,
  Loader2,
} from "lucide-react";
import { getBusinessTypeLabel } from "@/lib/taxonomy/compat";
import {
  getBusinessTypePlaceholder,
  resolveBusinessImageSrc,
} from "@/lib/placeholders/businessPlaceholders";
import {
  normalizeUrl,
  formatTime,
  formatHoursValue,
  parseHours,
  toObject,
} from "@/lib/business/profileUtils";

const NAV_OFFSET = 152;

export { normalizeUrl, formatTime, formatHoursValue, parseHours, toObject };

export function getProfileIdentity(profile) {
  const name = profile?.business_name || profile?.full_name || "Business profile";
  const businessType = getBusinessTypeLabel(profile, "Local business");
  const city = profile?.city || "";
  const location = [city, profile?.state].filter(Boolean).join(", ");
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

  return {
    name,
    businessType,
    city,
    location,
    placeholderSrc,
    avatarSrc,
    coverSrc,
  };
}

function buildDirectionsUrl(profile) {
  const query = [profile?.address, profile?.city, profile?.state]
    .filter(Boolean)
    .join(", ");
  if (!query) return "";
  return `https://maps.google.com/?q=${encodeURIComponent(query)}`;
}

function getHoursStatus(profile) {
  const raw = toObject(profile?.hours_json);
  if (!raw || typeof raw !== "object" || !Object.keys(raw).length) {
    return { label: "Hours unavailable", tone: "muted" };
  }

  const weekdayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const now = new Date();
  const today = raw?.[weekdayMap[now.getDay()]];

  if (!today || typeof today !== "object") {
    return { label: "Hours listed", tone: "neutral" };
  }
  if (today.isClosed) {
    return { label: "Closed today", tone: "muted" };
  }
  if (!(today.open && today.close)) {
    return { label: "Hours listed", tone: "neutral" };
  }

  const [openHour = 0, openMinute = 0] = String(today.open)
    .split(":")
    .map((value) => Number(value));
  const [closeHour = 0, closeMinute = 0] = String(today.close)
    .split(":")
    .map((value) => Number(value));
  if (
    [openHour, openMinute, closeHour, closeMinute].some((value) =>
      Number.isNaN(value)
    )
  ) {
    return { label: "Hours listed", tone: "neutral" };
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = openHour * 60 + openMinute;
  const closeMinutes = closeHour * 60 + closeMinute;
  const isOpen =
    closeMinutes >= openMinutes
      ? currentMinutes >= openMinutes && currentMinutes <= closeMinutes
      : currentMinutes >= openMinutes || currentMinutes <= closeMinutes;

  return {
    label: isOpen ? "Open now" : "Closed now",
    tone: isOpen ? "success" : "muted",
  };
}

function scrollToSection(id) {
  if (typeof window === "undefined") return;
  const element = document.getElementById(id);
  if (!element) return;
  const top = element.getBoundingClientRect().top + window.scrollY - NAV_OFFSET;
  window.scrollTo({ top, behavior: "smooth" });
}

export function ProfilePageShell({ children, className = "" }) {
  return (
    <div
      className={cx(
        "min-h-screen bg-[#f8fafc] text-slate-950 business-theme",
        className
      )}
    >
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top_left,rgba(111,76,255,0.08),transparent_36%),radial-gradient(circle_at_top_right,rgba(15,23,42,0.05),transparent_30%),linear-gradient(180deg,#fbfdff_0%,#f8fafc_46%,#f3f7fb_100%)]" />
      <div className="mx-auto max-w-[1180px] px-4 pb-12 pt-0 sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
}

export function ProfileSection({
  id,
  title,
  description,
  action,
  children,
  className = "",
  contentClassName = "",
}) {
  return (
    <section id={id} className={cx("scroll-mt-40 border-t border-slate-100 pt-8 md:pt-10", className)}>
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-[1.18rem] font-semibold tracking-[-0.03em] text-slate-950 sm:text-[1.28rem]">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0 self-start md:self-end">{action}</div> : null}
      </div>
      <div className={cx("bg-transparent", contentClassName)}>{children}</div>
    </section>
  );
}

export function ProfileEmptyState({
  title,
  detail,
  icon: Icon,
  action,
  className = "",
}) {
  return (
    <div
      className={cx(
        "rounded-[16px] border border-slate-100 bg-white px-4 py-4 shadow-sm",
        className
      )}
    >
      <div className="flex items-start gap-3">
        {Icon ? (
          <div className="rounded-xl bg-slate-50 p-2 text-[#6a3df0]">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">{title}</p>
          {detail ? <p className="mt-1 text-sm leading-6 text-slate-500">{detail}</p> : null}
          {action ? <div className="mt-3">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function ProfileSectionNav({ items }) {
  const [activeId, setActiveId] = useState(items?.[0]?.id || "");

  useEffect(() => {
    if (typeof window === "undefined" || !items?.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target?.id) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: "-25% 0px -60% 0px",
        threshold: [0.15, 0.35, 0.6],
      }
    );

    items.forEach((item) => {
      const node = document.getElementById(item.id);
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [items]);

  return (
    <div className="sticky top-16 z-20 mb-8 overflow-x-auto rounded-full border border-slate-100 bg-[rgba(255,255,255,0.92)] px-2 py-1.5 shadow-sm backdrop-blur">
      <div className="flex min-w-max items-center gap-1">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollToSection(item.id)}
              className={cx(
                "rounded-full px-3.5 py-2 text-sm font-medium transition",
                active
                  ? "bg-[#ede7ff] text-[#5b37d6]"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PreviewMetaChip({ icon: Icon, children, tone = "default" }) {
  const toneClassName =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "muted"
        ? "border-slate-200 bg-slate-50 text-slate-600"
        : "border-[#e5dcff] bg-[#f6f1ff] text-[#5b37d6]";

  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium",
        toneClassName
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {children}
    </span>
  );
}

function HeroMetadata({ location, ratingSummary, businessType, profile }) {
  const count = ratingSummary?.count || 0;
  const average = Number(ratingSummary?.average || 0);
  const hoursStatus = getHoursStatus(profile);

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
        {businessType ? <span>{businessType}</span> : null}
        {location ? (
          <span className="inline-flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[#6a3df0]" />
            {location}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-500" fill="currentColor" />
          {count ? `${average.toFixed(1)} · ${count} review${count === 1 ? "" : "s"}` : "No reviews yet"}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <PreviewMetaChip>Local business</PreviewMetaChip>
        {location ? (
          <PreviewMetaChip icon={MapPin} tone="muted">
            {location}
          </PreviewMetaChip>
        ) : null}
        {businessType ? (
          <PreviewMetaChip tone="muted">{businessType}</PreviewMetaChip>
        ) : null}
        <PreviewMetaChip icon={Clock3} tone={hoursStatus.tone}>
          {hoursStatus.label}
        </PreviewMetaChip>
      </div>
    </>
  );
}

function HeroPreviewActions({ profile, publicPath }) {
  const [copied, setCopied] = useState(false);
  const website = profile?.website ? normalizeUrl(profile.website) : "";
  const directions = buildDirectionsUrl(profile);
  const primaryAction = directions
    ? { key: "directions", label: "Directions", href: directions, icon: MapPin }
    : null;
  const secondaryActions = [
    website ? { key: "website", label: "Website", href: website, icon: Globe } : null,
    profile?.phone
      ? { key: "phone", label: "Call", href: `tel:${profile.phone}`, icon: Phone }
      : null,
  ].filter(Boolean);
  const PrimaryIcon = primaryAction?.icon;

  const handleShare = async () => {
    if (typeof window === "undefined") return;
    const shareUrl = publicPath
      ? new URL(publicPath, window.location.origin).toString()
      : window.location.href;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
      {primaryAction ? (
        <a
          href={primaryAction.href}
          target={primaryAction.href.startsWith("tel:") ? undefined : "_blank"}
          rel={primaryAction.href.startsWith("tel:") ? undefined : "noreferrer"}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-[#6E34FF] bg-[#6E34FF] px-4 py-2.5 text-sm font-medium text-white shadow-[0_18px_38px_-24px_rgba(106,61,240,0.7)] transition hover:border-[#5E2DE0] hover:bg-[#5E2DE0]"
        >
          {PrimaryIcon ? <PrimaryIcon className="h-4 w-4" /> : null}
          {primaryAction.label}
        </a>
      ) : null}
      <button
        type="button"
        onClick={handleShare}
        className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
      >
        <Share2 className="h-4 w-4 text-[#6a3df0]" />
        {copied ? "Copied" : "Share"}
      </button>
      {secondaryActions.map((action) => {
        const Icon = action.icon;
        return (
          <a
            key={action.key}
            href={action.href}
            target={action.href.startsWith("tel:") ? undefined : "_blank"}
            rel={action.href.startsWith("tel:") ? undefined : "noreferrer"}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
          >
            <Icon className="h-4 w-4 text-[#6a3df0]" />
            {action.label}
          </a>
        );
      })}
    </div>
  );
}

function PreviewHeroCard({
  profile,
  ratingSummary,
  publicPath,
  name,
  businessType,
  location,
  placeholderSrc,
  avatarSrc,
}) {
  return (
    <div className="relative z-10 -mt-10 px-4 sm:-mt-14 sm:px-6 lg:px-8">
      <div className="rounded-[28px] border border-slate-200/90 bg-white/96 p-4 shadow-[0_28px_80px_-42px_rgba(15,23,42,0.4)] backdrop-blur sm:p-5 lg:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center lg:min-w-0 lg:flex-1">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[26px] border border-white bg-slate-100 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.38)] sm:h-24 sm:w-24">
              <FastImage
                src={avatarSrc}
                alt={`${name} logo`}
                fallbackSrc={placeholderSrc}
                className="object-cover"
                fill
                sizes="96px"
                priority
                decoding="async"
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-[1.9rem] font-semibold tracking-[-0.05em] text-slate-950 sm:text-[2.35rem]">
                {name}
              </h1>
              <HeroMetadata
                location={location}
                ratingSummary={ratingSummary}
                businessType={businessType}
                profile={profile}
              />
            </div>
          </div>

          <div className="w-full lg:w-auto lg:max-w-[420px]">
            <HeroPreviewActions profile={profile} publicPath={publicPath} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProfileHero({
  profile,
  ratingSummary,
  mode = "preview",
  publicPath,
  backHref,
  primaryAction,
  onAvatarUpload,
  onCoverUpload,
  uploading,
  editMode = false,
}) {
  const { name, businessType, location, placeholderSrc, avatarSrc, coverSrc } =
    useMemo(() => getProfileIdentity(profile), [profile]);

  const topActionClasses =
    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition";
  const isPreview = mode === "preview";

  return (
    <section className={cx("mb-6", isPreview ? "lg:mb-8" : "")}>
      <div className="overflow-hidden rounded-[34px] border border-slate-200 bg-white shadow-[0_32px_80px_-48px_rgba(15,23,42,0.4)]">
        <div
          className={cx(
            "relative",
            isPreview ? "h-[180px] sm:h-[220px] lg:h-[250px]" : "h-[220px] sm:h-[260px] lg:h-[300px]"
          )}
        >
          <div
            className={cx(
              "absolute inset-0",
              isPreview
                ? "bg-[linear-gradient(180deg,rgba(15,23,42,0.08),rgba(15,23,42,0.12)_45%,rgba(15,23,42,0.62)_100%),linear-gradient(120deg,rgba(106,61,240,0.14),rgba(15,23,42,0.1))]"
                : "bg-[linear-gradient(180deg,rgba(15,23,42,0.16),rgba(15,23,42,0.4)),linear-gradient(120deg,rgba(106,61,240,0.16),rgba(15,23,42,0.08))]"
            )}
          />
          <FastImage
            src={coverSrc}
            alt={`${name} cover`}
            fallbackSrc={placeholderSrc}
            className="object-cover"
            fill
            sizes="(max-width: 1280px) 100vw, 1200px"
            priority
            decoding="async"
          />

          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 sm:p-6">
            {backHref ? (
              <Link
                href={backHref}
                className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/85 px-4 py-2 text-sm font-medium text-slate-900 backdrop-blur transition hover:bg-white"
              >
                Back to business profile
              </Link>
            ) : (
              <span />
            )}

            {editMode && onCoverUpload ? (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/40 bg-white/85 px-4 py-2 text-sm font-medium text-slate-900 backdrop-blur transition hover:bg-white">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    onCoverUpload(file);
                  }}
                  disabled={uploading?.cover}
                />
                {uploading?.cover ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Pencil className="h-4 w-4" />
                )}
                Cover photo
              </label>
            ) : null}
          </div>
        </div>

        {isPreview ? (
          <PreviewHeroCard
            profile={profile}
            ratingSummary={ratingSummary}
            publicPath={publicPath}
            name={name}
            businessType={businessType}
            location={location}
            placeholderSrc={placeholderSrc}
            avatarSrc={avatarSrc}
          />
        ) : (
          <div className="relative bg-white px-5 pb-5 pt-0 sm:px-6 lg:px-8">
            <div className="-mt-8 flex flex-col gap-4 lg:-mt-10 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="relative h-24 w-24 overflow-hidden rounded-[28px] border border-white bg-slate-100 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.45)] sm:h-28 sm:w-28">
                  <FastImage
                    src={avatarSrc}
                    alt={`${name} logo`}
                    fallbackSrc={placeholderSrc}
                    className="object-cover"
                    fill
                    sizes="112px"
                    priority
                    decoding="async"
                  />
                  {editMode && onAvatarUpload ? (
                    <label className="absolute bottom-2 right-2 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white bg-white text-slate-700 shadow">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          onAvatarUpload(file);
                        }}
                        disabled={uploading?.avatar}
                      />
                      {uploading?.avatar ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Pencil className="h-4 w-4" />
                      )}
                    </label>
                  ) : null}
                </div>

                <div className="pb-0.5 lg:pr-4">
                  <h1 className="max-w-[12ch] text-[2rem] font-semibold tracking-[-0.045em] text-slate-950 sm:text-[2.5rem]">
                    {name}
                  </h1>
                  <HeroMetadata
                    location={location}
                    ratingSummary={ratingSummary}
                    businessType={businessType}
                    profile={profile}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:max-w-[320px] lg:justify-end">
                {primaryAction ? (
                  <button
                    type="button"
                    onClick={primaryAction.onClick}
                    className={cx(
                      topActionClasses,
                      "dashboard-primary-action bg-[#6E34FF] text-white hover:bg-[#5E2DE0]"
                    )}
                  >
                    {primaryAction.label}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
