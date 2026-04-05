"use client";

import { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import type { BrowseMode, ListingSummary } from "@/lib/browse/getHomeBrowseData";
import { primaryPhotoUrl } from "@/lib/listingPhotos";
import { getListingCategoryPlaceholder } from "@/lib/taxonomy/placeholders";
import { getCustomerListingUrl, getListingUrl } from "@/lib/ids/publicRefs";
import { normalizeInventory, sortListingsByAvailability } from "@/lib/inventory";

type TrendingListingsSectionProps = {
  mode?: BrowseMode;
  listings?: ListingSummary[];
  city?: string | null;
  title?: string;
  subtitle?: string;
  limit?: number;
};

function formatPrice(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "Price TBD";
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return `$${number.toFixed(2)}`;
}

function buildBadges(listing: ListingSummary, index: number) {
  const badges: string[] = [];
  const createdAt = listing?.created_at ? new Date(listing.created_at) : null;
  const isRecent =
    createdAt instanceof Date &&
    !Number.isNaN(createdAt.getTime()) &&
    Date.now() - createdAt.getTime() <= 1000 * 60 * 60 * 24 * 10;

  if (isRecent) {
    badges.push("New");
  } else if (index < 3) {
    badges.push("Popular");
  }

  const inventory = normalizeInventory(listing);
  if (inventory.availability === "low_stock") {
    badges.push("Low stock");
  }

  return badges.slice(0, 1);
}

export default function TrendingListingsSection({
  mode = "public",
  listings = [],
  city,
  title = "Trending near you",
  subtitle,
  limit = 8,
}: TrendingListingsSectionProps) {
  const visibleListings = useMemo(
    () => sortListingsByAvailability(Array.isArray(listings) ? listings : []).slice(0, limit),
    [limit, listings]
  );

  const resolvedSubtitle = useMemo(() => {
    if (subtitle) return subtitle;
    const safeCity = String(city || "").trim();
    return safeCity
      ? `Fresh listings and services people are browsing in ${safeCity}`
      : "Fresh listings and services ready to browse nearby";
  }, [city, subtitle]);

  void mode;
  const viewAllHref = "/listings";

  if (!visibleListings.length) return null;

  return (
    <section className="relative z-20 -mt-4 w-full bg-[#fcfcfd] pb-6 pt-6 md:-mt-6 md:pb-8 md:pt-8">
      <div className="mx-auto w-full max-w-6xl px-6 md:px-8">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 md:mb-6">
          <div className="min-w-0">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[rgba(88,28,135,0.8)]">
              Shop local
            </p>
            <h2 className="mt-1 text-[1.55rem] font-semibold tracking-[-0.04em] text-slate-900 sm:text-[1.7rem]">
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{resolvedSubtitle}</p>
          </div>

          <Link
            href={viewAllHref}
            prefetch={false}
            className="inline-flex h-10 items-center justify-center rounded-full border border-[#43365f1f] bg-white/78 px-4.5 text-sm font-medium text-[#352d43] shadow-[0_10px_26px_-24px_rgba(15,23,42,0.2)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#6a4c9338] hover:bg-[#f7f2fb] hover:text-[#231c31] hover:shadow-[0_14px_30px_-24px_rgba(106,76,147,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6a4c9340] focus-visible:ring-offset-2 focus-visible:ring-offset-[#faf6f0]"
          >
            View all listings
          </Link>
        </div>

        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:gap-5 md:overflow-visible xl:grid-cols-4">
          {visibleListings.map((listing, index) => {
            const href =
              mode === "customer" ? getCustomerListingUrl(listing) : getListingUrl(listing);
            const imageSrc = primaryPhotoUrl(listing.photo_url) || getListingCategoryPlaceholder(listing);
            const badges = buildBadges(listing, index);
            const businessName =
              String(listing?.business_name || "").trim() || "Local business";
            const categoryName =
              String(
                listing?.listing_category ||
                  listing?.category_info?.name ||
                  listing?.category ||
                  ""
              ).trim() || "Listing";

            return (
              <Link
                key={listing.public_id || listing.id || `${listing.title}-${index}`}
                href={href}
                prefetch={false}
                className="group w-[278px] min-w-[278px] snap-start overflow-hidden rounded-[24px] border border-[rgba(255,255,255,0.52)] bg-[#fdfbf8] shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-[4px] hover:shadow-[0_18px_45px_rgba(0,0,0,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8c73bb59] focus-visible:ring-offset-2 focus-visible:ring-offset-[#faf6f0] md:min-w-0"
              >
                <div className="relative aspect-[4/5] w-full overflow-hidden bg-stone-100 md:aspect-[4/4.3]">
                  <Image
                    src={imageSrc}
                    alt={listing.title || "Listing"}
                    fill
                    sizes="(max-width: 767px) 278px, (max-width: 1279px) 33vw, 24vw"
                    className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/16 via-transparent to-transparent" />
                  {badges.length ? (
                    <div className="absolute left-3 top-3">
                      <span className="rounded-full border border-white/55 bg-white/88 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-700 shadow-[0_6px_16px_rgba(15,23,42,0.12)] backdrop-blur-sm">
                        {badges[0]}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2 px-4 pb-4 pt-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 text-[15px] font-semibold leading-tight tracking-[-0.02em] text-slate-900">
                        {listing.title || "Untitled listing"}
                      </h3>
                      <p className="mt-1 line-clamp-1 text-sm text-slate-500">{businessName}</p>
                    </div>
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-50 p-2 text-purple-600 transition-all duration-300 group-hover:translate-x-0.5 group-hover:bg-purple-100 group-hover:text-purple-700">
                      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                        <path
                          d="M7 5L12 10L7 15"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <p className="text-[1.05rem] font-semibold tracking-[-0.03em] text-slate-900">
                      {formatPrice(listing.price)}
                    </p>
                    <p className="line-clamp-1 text-xs font-medium uppercase tracking-[0.08em] text-slate-400">
                      {categoryName}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
