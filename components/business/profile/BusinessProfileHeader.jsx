"use client";

import Link from "next/link";
import FastImage from "@/components/FastImage";
import { Pencil, Loader2, Star } from "lucide-react";
import { getBusinessTypeLabel } from "@/lib/taxonomy/compat";
import {
  getBusinessTypePlaceholder,
  resolveBusinessImageSrc,
} from "@/lib/placeholders/businessPlaceholders";

export default function BusinessProfileHeader({
  profile,
  averageRating,
  reviewCount,
  tone,
  publicHref,
  isLight,
  editMode,
  uploading,
  onAvatarUpload,
  onCoverUpload,
  onViewPublic,
}) {
  const name =
    profile?.business_name || profile?.full_name || "Business profile";
  const businessType = getBusinessTypeLabel(profile, "Business type");
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
  const ratingLabel = reviewCount
    ? `${averageRating.toFixed(1)} · ${reviewCount} review${reviewCount === 1 ? "" : "s"}`
    : "No reviews yet";

  return (
    <div className="sticky top-16 z-10">
      <div
        className={`relative overflow-hidden rounded-b-2xl border-x border-b ${tone.headerBorder} ${tone.headerSurface} shadow-[0_30px_70px_-50px_rgba(15,23,42,0.6)]`}
      >
        <div className="relative h-48 md:h-60">
          {!profile?.cover_photo_url ? (
            <div
              className={`absolute inset-0 ${
                isLight
                  ? "bg-gradient-to-br from-rose-100 via-pink-200 to-slate-100"
                  : "bg-gradient-to-br from-fuchsia-500/40 via-indigo-500/30 to-slate-900/40"
              }`}
            />
          ) : null}
          <FastImage
            src={coverSrc}
            alt={`${name} cover`}
            className="object-cover"
            fallbackSrc={placeholderSrc}
            fill
            sizes="(max-width: 768px) 100vw, 80vw"
            priority
            decoding="async"
          />
          {editMode ? (
            <label
              className={`absolute right-4 top-4 inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border shadow ${tone.buttonSecondary}`}
            >
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  onCoverUpload?.(file);
                }}
                disabled={uploading?.cover}
              />
              {uploading?.cover ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Pencil className="h-4 w-4" />
              )}
            </label>
          ) : null}
          <div
            className={`pointer-events-none absolute inset-0 ${
              isLight
                ? "bg-gradient-to-t from-white/80 via-white/20 to-transparent"
                : "bg-gradient-to-t from-black/65 via-black/20 to-transparent"
            }`}
          />
        </div>

        <div className={`flex flex-col gap-4 px-6 pb-6 pt-6 md:px-8 md:pb-8 md:pt-6 md:flex-row md:items-end md:justify-between border-t ${tone.headerBorder}`}>
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="relative h-24 w-24 rounded-xl border border-white/20 bg-white/10 p-1 shadow-lg">
              <FastImage
                src={avatarSrc}
                alt={`${name} logo`}
                className="rounded-lg object-cover"
                fallbackSrc={placeholderSrc}
                width={96}
                height={96}
                sizes="96px"
                priority
                decoding="async"
              />
              {editMode ? (
                <label
                  className={`absolute -right-2 -top-2 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border shadow ${tone.buttonSecondary}`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      onAvatarUpload?.(file);
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

            <div className="space-y-2">
              <div>
                <h1 className={`text-2xl md:text-3xl font-bold ${tone.textStrong}`}>
                  {name}
                </h1>
                <p className={`text-sm md:text-base ${tone.textMuted}`}>
                  {businessType}
                  {city ? ` · ${city}` : ""}
                </p>
              </div>
              <div className={`inline-flex items-center gap-2 text-sm ${tone.textSoft}`}>
                <span className="flex items-center gap-1">
                  <Star className="h-4 w-4 text-amber-400" fill="currentColor" />
                  {ratingLabel}
                </span>
              </div>
            </div>
          </div>

          {publicHref ? (
            <Link
              href={publicHref}
              prefetch
              onClick={onViewPublic}
              className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold ${tone.buttonSecondary}`}
            >
              View as customer
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
