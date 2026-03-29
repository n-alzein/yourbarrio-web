"use client";

import FastImage from "@/components/FastImage";
import { resolveBusinessImageSrc } from "@/lib/placeholders/businessPlaceholders";

const formatDistance = (distanceKm) => {
  if (typeof distanceKm !== "number" || !Number.isFinite(distanceKm)) return null;
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m away`;
  return `${distanceKm.toFixed(1)} km away`;
};

const formatRating = (rating) => {
  if (typeof rating !== "number" || !Number.isFinite(rating)) return null;
  return rating.toFixed(1);
};

const formatLocationLine = (business) => {
  const neighborhood = (business?.neighborhood || business?.district || "").trim();
  const city = (business?.city || "").trim();
  const state = (business?.state || business?.state_code || "").trim();
  if (neighborhood && city) return `${neighborhood}, ${city}`;
  if (city && state) return `${city}, ${state}`;
  return city || neighborhood || state || null;
};

export default function NearbyBusinessCard({
  business,
  isMobile = false,
  active,
  selected,
  onHover,
  onLeave,
  onClick,
  onMapFocusClick,
  registerCard,
}) {
  const distanceLabel = formatDistance(business.distance_km ?? business.distanceKm ?? null);
  const ratingLabel = formatRating(business.rating ?? null);
  const locationLine = formatLocationLine(business);
  const photo = resolveBusinessImageSrc({
    imageUrl:
      business?.imageUrl ||
      business?.profile_photo_url ||
      business?.photo_url ||
      business?.image_url ||
      business?.avatar_url ||
      business?.logo_url ||
      null,
    businessType: business?.business_type,
    legacyCategory: business?.categoryLabel || business?.category,
  });

  return (
    <article
      ref={(node) => registerCard(business.id, node)}
      data-business-id={business.id}
      data-selected={selected ? "true" : "false"}
      className={`group relative w-full overflow-hidden rounded-2xl border p-3 transition duration-200 focus-within:ring-2 focus-within:ring-violet-400/70 ${
        selected
          ? "border-violet-400/70 bg-white/10"
          : active
            ? "border-violet-300/60 bg-white/[0.075]"
            : "border-white/12 bg-white/[0.045] hover:border-white/25"
      }`}
      onMouseEnter={() => onHover(business.id)}
      onMouseLeave={onLeave}
      onFocus={() => onHover(business.id)}
      onBlur={onLeave}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="grid min-w-0 flex-1 grid-cols-[92px_1fr] gap-3 text-left"
          onClick={() => onClick(business)}
          aria-pressed={selected}
          data-selected={selected ? "true" : "false"}
          aria-label={
            isMobile
              ? `Open ${business.name || "business"} profile`
              : `Focus ${business.name || "business"} on map`
          }
        >
          <div className="relative h-[92px] w-[92px] overflow-hidden rounded-xl border border-white/10 bg-white/10">
            <FastImage
              src={photo}
              alt={business.name || "Business"}
              fill
              sizes="92px"
              className="object-cover"
              fallbackSrc={photo}
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

            {locationLine ? <p className="line-clamp-1 text-xs text-white/60">{locationLine}</p> : null}

            {business.description ? (
              <p className="line-clamp-2 text-xs leading-relaxed text-white/65">{business.description}</p>
            ) : !isMobile ? (
              <p className="line-clamp-1 text-xs text-white/50">Tap to focus on map</p>
            ) : null}
          </div>
        </button>

        {isMobile ? (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onMapFocusClick?.(business);
            }}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-base text-white/90 transition hover:border-white/35 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
            aria-label={`Show ${business.name || "business"} on map`}
            title="Show on map"
          >
            <span aria-hidden="true">📍</span>
          </button>
        ) : null}
      </div>
    </article>
  );
}
