"use client";

import FastImage from "@/components/FastImage";
import { primaryPhotoUrl } from "@/lib/listingPhotos";

const formatDistance = (distanceKm) => {
  if (typeof distanceKm !== "number" || !Number.isFinite(distanceKm)) return null;
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m away`;
  return `${distanceKm.toFixed(1)} km away`;
};

const formatRating = (rating) => {
  if (typeof rating !== "number" || !Number.isFinite(rating)) return null;
  return rating.toFixed(1);
};

export default function NearbyBusinessCard({
  business,
  active,
  selected,
  onHover,
  onLeave,
  onClick,
  registerCard,
}) {
  const distanceLabel = formatDistance(business.distance_km ?? business.distanceKm ?? null);
  const ratingLabel = formatRating(business.rating ?? null);
  const photo =
    primaryPhotoUrl(
      business?.imageUrl ||
        business?.profile_photo_url ||
        business?.photo_url ||
        business?.image_url ||
        business?.avatar_url ||
        business?.logo_url
    ) || "/business-placeholder.png";

  return (
    <article
      ref={(node) => registerCard(business.id, node)}
      data-business-id={business.id}
      data-selected={selected ? "true" : "false"}
      className={`group relative w-full overflow-hidden rounded-2xl border p-3 transition duration-200 focus-within:ring-2 focus-within:ring-violet-400/70 ${
        selected
          ? "border-violet-400/70 bg-white/10 shadow-[0_10px_28px_rgba(139,92,246,0.22)]"
          : active
            ? "border-violet-300/60 bg-white/[0.075] shadow-lg"
            : "border-white/12 bg-white/[0.045] shadow-[0_8px_24px_rgba(2,6,23,0.22)] hover:border-white/25"
      }`}
      onMouseEnter={() => onHover(business.id)}
      onMouseLeave={onLeave}
      onFocus={() => onHover(business.id)}
      onBlur={onLeave}
    >
      <button
        type="button"
        className="grid w-full grid-cols-[92px_1fr] gap-3 text-left"
        onClick={() => onClick(business)}
        aria-pressed={selected}
        data-selected={selected ? "true" : "false"}
        aria-label={`Focus ${business.name || "business"} on map`}
      >
        <div className="relative h-[92px] w-[92px] overflow-hidden rounded-xl border border-white/10 bg-white/10">
          <FastImage
            src={photo}
            alt={business.name || "Business"}
            fill
            sizes="92px"
            className="object-cover"
            fallbackSrc="/business-placeholder.png"
            decoding="async"
          />
        </div>

        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-start justify-between gap-1.5">
            <h3 className="line-clamp-1 text-sm font-semibold text-white">{business.name || "Local business"}</h3>
            {distanceLabel ? <span className="text-[11px] text-white/70">{distanceLabel}</span> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
            <span className="line-clamp-1">{business.categoryLabel || business.category || "Local spot"}</span>
            {ratingLabel ? <span>• ★ {ratingLabel}</span> : null}
            {typeof business.open_now === "boolean" ? (
              <span className={business.open_now ? "text-emerald-300" : "text-amber-300"}>
                {business.open_now ? "Open now" : "Closed"}
              </span>
            ) : null}
          </div>

          {business.description ? (
            <p className="line-clamp-2 text-xs leading-relaxed text-white/65">{business.description}</p>
          ) : (
            <p className="line-clamp-1 text-xs text-white/50">Tap to focus on map</p>
          )}
        </div>
      </button>
    </article>
  );
}
