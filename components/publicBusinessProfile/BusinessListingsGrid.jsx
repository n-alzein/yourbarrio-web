"use client";

import Link from "next/link";
import FastImage from "@/components/FastImage";
import { ArrowUpRight, MapPin, Tag } from "lucide-react";
import { primaryPhotoUrl } from "@/lib/listingPhotos";
import { getListingUrl } from "@/lib/ids/publicRefs";
import { getListingCategoryLabel } from "@/lib/taxonomy/compat";
import { getListingCategoryPlaceholder } from "@/lib/taxonomy/placeholders";
import { calculateListingPricing } from "@/lib/pricing";
import {
  ProfileEmptyState,
  ProfileSection,
} from "@/components/business/profile-system/ProfileSystem";

function formatPrice(value) {
  if (value === null || value === undefined || value === "") return "Price TBD";
  const number = Number(value);
  if (Number.isNaN(number)) return value;
  return `$${number.toFixed(2).replace(/\\.00$/, "")}`;
}

function getDisplayPriceCents(item) {
  const finalPriceCents = Number(item?.finalPriceCents);
  if (Number.isFinite(finalPriceCents) && finalPriceCents > 0) return finalPriceCents;
  return calculateListingPricing(item?.price).finalPriceCents;
}

function formatPriceCents(value) {
  if (!Number.isFinite(value) || value <= 0) return "Price TBD";
  return `$${(value / 100).toFixed(2)}`;
}

export default function BusinessListingsGrid({
  listings,
  className = "",
  title = "Listings",
  description = "Available offers from this business.",
  headerAction = null,
  itemHrefResolver = getListingUrl,
  priceMode = "allIn",
}) {
  return (
    <ProfileSection
      id="listings"
      title={title}
      description={description}
      action={headerAction}
      className={className}
    >
      {!listings?.length ? (
        <ProfileEmptyState
          title="No listings yet"
          detail="Available products and services will appear here."
          icon={Tag}
        />
      ) : (
        <div className="-mx-1 px-1">
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-0.5 pb-2 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {listings.map((item) => {
              const cover = primaryPhotoUrl(item.photo_url);
              const categoryLabel = getListingCategoryLabel(item, "Listing");
              const displayPriceCents = getDisplayPriceCents(item);
              const priceLabel =
                priceMode === "base" || displayPriceCents <= 0
                  ? formatPrice(item.price)
                  : formatPriceCents(displayPriceCents);
              return (
                <Link
                  key={item.id}
                  href={itemHrefResolver(item)}
                  className="group flex w-[calc((100%-1rem)/2)] min-w-[calc((100%-1rem)/2)] shrink-0 snap-start flex-col overflow-hidden rounded-[18px] border border-slate-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-md sm:w-[18.5rem] sm:min-w-[18.5rem] md:w-[19.5rem] md:min-w-[19.5rem] lg:w-[18rem] lg:min-w-[18rem] xl:w-[17rem] xl:min-w-[17rem]"
                >
                  <div className="relative aspect-square overflow-hidden bg-slate-100">
                    <FastImage
                      src={cover || getListingCategoryPlaceholder(item)}
                      alt={item.title || "Listing"}
                      className="object-cover transition duration-300 group-hover:scale-[1.02]"
                      fill
                      sizes="(max-width: 639px) calc((100vw - 1rem) / 2), (max-width: 767px) 18.5rem, (max-width: 1023px) 19.5rem, (max-width: 1279px) 18rem, 17rem"
                      decoding="async"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-2.5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex rounded-full border border-[#e5dcff] bg-[#f6f1ff] px-2.5 py-1 text-[11px] font-medium text-[#5b37d6]">
                        {categoryLabel}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">
                        {priceLabel}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold tracking-[-0.02em] text-slate-950 line-clamp-2 sm:text-[0.95rem]">
                        {item.title || "Untitled listing"}
                      </h3>
                    </div>

                    <div className="flex flex-wrap gap-1.5 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2 py-1">
                        <Tag className="h-3 w-3 text-[#6a3df0]" />
                        {categoryLabel}
                      </span>
                      {item.city ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2 py-1">
                          <MapPin className="h-3 w-3 text-[#6a3df0]" />
                          {item.city}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                      <span className="text-xs text-slate-400">View details</span>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-[#5b37d6]">
                        Open
                        <ArrowUpRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </ProfileSection>
  );
}
