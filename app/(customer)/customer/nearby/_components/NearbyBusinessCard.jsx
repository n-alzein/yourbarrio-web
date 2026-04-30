"use client";

import FastImage from "@/components/FastImage";
import { resolveBusinessImageSrc } from "@/lib/placeholders/businessPlaceholders";
import { Heart } from "lucide-react";

const formatDistance = (distanceKm) => {
  if (typeof distanceKm !== "number" || !Number.isFinite(distanceKm)) return null;
  const miles = distanceKm * 0.621371;
  if (!Number.isFinite(miles)) return null;
  if (miles < 0.1) return "Nearby";
  return `${miles.toFixed(1)} mi`;
};

const formatLocationLine = (business) => {
  const neighborhood = (business?.neighborhood || business?.district || "").trim();
  const city = (business?.city || "").trim();
  const state = (business?.state || business?.state_code || "").trim();
  if (neighborhood && city) return `${neighborhood}, ${city}`;
  if (city && state) return `${city}, ${state}`;
  return city || neighborhood || state || null;
};

const getHookLine = (business, locationLine) => {
  const category = business?.categoryLabel || business?.category || "Local business";
  const city = (business?.city || "").trim();
  const rawHook = typeof business?.hookLine === "string" ? business.hookLine.trim() : "";
  if (business?.isNew || rawHook === "New on YourBarrio") {
    return "✨ Just added · Be the first to explore";
  }
  if (business?.isVerified || rawHook === "Verified local business") {
    return "✓ Verified · Trusted local shop";
  }
  if (rawHook) return rawHook;
  if (city) return `${category} in ${city}`;
  if (locationLine) return `${category} near ${locationLine}`;
  return `Discover this ${category.toLowerCase()} on YourBarrio`;
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
  onToggleSave,
  isSaved = false,
  saveLoading = false,
  showSaveControl = true,
  registerCard,
}) {
  const distanceLabel = formatDistance(business.distance_km ?? business.distanceKm ?? null);
  const locationLine = formatLocationLine(business);
  const hookLine = getHookLine(business, locationLine);
  const categoryLabel = business.categoryLabel || business.category || "Local spot";
  const metadataItems = [categoryLabel, locationLine, distanceLabel].filter(Boolean);
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
  const businessName = business.name || "business";
  const handleCardActivate = () => onClick(business);
  const handleCardKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCardActivate();
    }
  };

  return (
    <article
      ref={(node) => registerCard(business.id, node)}
      data-business-id={business.id}
      data-selected={selected ? "true" : "false"}
      className={`group relative h-full w-full overflow-hidden rounded-[1.45rem] border transition duration-200 focus-within:ring-2 focus-within:ring-slate-300/80 md:hover:-translate-y-[2px] ${
        selected
          ? "border-slate-300 bg-white shadow-sm shadow-[0_16px_36px_rgba(15,23,42,0.08)]"
          : active
            ? "border-slate-300 bg-white shadow-sm shadow-[0_16px_34px_rgba(15,23,42,0.08)]"
            : "border-slate-300/90 bg-white shadow-sm shadow-[0_8px_24px_rgba(15,23,42,0.04)] md:hover:border-slate-300 md:hover:shadow-md md:hover:shadow-[0_14px_32px_rgba(15,23,42,0.065)]"
      }`}
      onMouseEnter={() => onHover(business.id)}
      onMouseLeave={onLeave}
      onFocus={() => onHover(business.id)}
      onBlur={onLeave}
    >
      <div className="relative">
        <div
          role="button"
          tabIndex={0}
          className="flex h-full w-full min-w-0 cursor-pointer flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-inset"
          onClick={handleCardActivate}
          onKeyDown={handleCardKeyDown}
          data-selected={selected ? "true" : "false"}
          aria-pressed={selected}
          aria-label={`Open ${businessName} profile`}
        >
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-t-[1.45rem] bg-slate-100">
            <FastImage
              src={photo}
              alt={business.name || "Business"}
              fill
              sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, (max-width: 1535px) 33vw, 420px"
              className="object-cover"
              fallbackSrc={photo}
              decoding="async"
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col p-4">
            <div className="min-w-0 space-y-0.5">
              <div className="min-w-0 space-y-0.5">
                <h3 className="line-clamp-2 text-base font-semibold leading-[1.22] tracking-[-0.015em] text-slate-950 sm:text-[1.05rem]">
                  {business.name || "Local business"}
                </h3>

                {metadataItems.length ? (
                  <p className="line-clamp-2 text-sm text-slate-500">
                    {metadataItems.join(" · ")}
                  </p>
                ) : null}
              </div>

              <p className="line-clamp-1 text-sm text-slate-500">
                {hookLine}
              </p>
            </div>

            <div className="mt-auto flex flex-col items-start gap-1 pt-2">
              {isMobile ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onMapFocusClick?.(business);
                  }}
                  className="inline-flex min-h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 md:hidden"
                  aria-label={`Show ${businessName} on map`}
                  title="Show on map"
                >
                  Show map
                </button>
              ) : null}

              <span className="inline-flex items-center text-sm font-medium text-violet-700 transition duration-150 md:group-hover:text-violet-800 md:group-hover:underline md:group-hover:underline-offset-4 group-focus-visible:text-violet-800 group-focus-visible:underline group-focus-visible:underline-offset-4">
                View shop
                <span className="ml-1 transition-transform duration-150 md:group-hover:translate-x-0.5">
                  →
                </span>
              </span>
            </div>
          </div>
        </div>

        {showSaveControl ? (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleSave?.(business);
            }}
            disabled={saveLoading}
            className={`absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/92 text-slate-600 shadow-sm backdrop-blur transition hover:border-rose-200 hover:text-rose-500 hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-violet-400/70 disabled:cursor-wait disabled:opacity-70 ${
              isSaved ? "opacity-95" : "opacity-80"
            }`}
            aria-pressed={isSaved}
            aria-label={isSaved ? "Remove saved shop" : "Save shop"}
            title={isSaved ? "Remove saved shop" : "Save shop"}
          >
            <Heart
              className={`h-4.5 w-4.5 ${isSaved ? "text-rose-500" : ""}`}
              fill={isSaved ? "currentColor" : "none"}
              aria-hidden="true"
            />
          </button>
        ) : null}
      </div>
    </article>
  );
}
