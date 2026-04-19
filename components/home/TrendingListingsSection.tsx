"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { BrowseMode, ListingSummary } from "@/lib/browse/getHomeBrowseData";
import { primaryPhotoUrl } from "@/lib/listingPhotos";
import { getListingCategoryPlaceholder } from "@/lib/taxonomy/placeholders";
import { getCustomerListingUrl, getListingUrl } from "@/lib/ids/publicRefs";
import { sortListingsByAvailability } from "@/lib/inventory";
import HomeSectionContainer from "@/components/home/HomeSectionContainer";
import { calculateListingPricing } from "@/lib/pricing";

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

function getDisplayPriceCents(listing: ListingSummary) {
  const finalPriceCents = Number(listing?.finalPriceCents);
  if (Number.isFinite(finalPriceCents) && finalPriceCents > 0) return finalPriceCents;
  return calculateListingPricing(listing?.price).finalPriceCents;
}

function formatPriceCents(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "Price TBD";
  return `$${(value / 100).toFixed(2)}`;
}

export default function TrendingListingsSection({
  mode = "public",
  listings = [],
  city,
  title = "Trending near you",
  subtitle,
  limit = 8,
}: TrendingListingsSectionProps) {
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const visibleListings = useMemo(
    () => sortListingsByAvailability(Array.isArray(listings) ? listings : []).slice(0, limit),
    [limit, listings]
  );

  const resolvedSubtitle = useMemo(() => {
    if (subtitle) return subtitle;
    const safeCity = String(city || "").trim();
    return safeCity
      ? `What people are browsing in ${safeCity}`
      : "What people are browsing nearby";
  }, [city, subtitle]);

  void mode;
  const viewAllHref = "/listings";

  useEffect(() => {
    const node = carouselRef.current;
    if (!node) return undefined;

    const updateFades = () => {
      const maxScrollLeft = node.scrollWidth - node.clientWidth;
      setShowLeftFade(node.scrollLeft > 8);
      setShowRightFade(maxScrollLeft - node.scrollLeft > 8);
    };

    updateFades();
    node.addEventListener("scroll", updateFades, { passive: true });
    window.addEventListener("resize", updateFades);

    return () => {
      node.removeEventListener("scroll", updateFades);
      window.removeEventListener("resize", updateFades);
    };
  }, [visibleListings.length]);

  if (!visibleListings.length) return null;

  return (
    <section className="relative z-20 -mt-2 w-full bg-[#fcfcfd] pb-6 pt-7 md:-mt-3 md:pb-8 md:pt-9">
      <HomeSectionContainer className="px-4 sm:px-6 md:px-8">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3 md:mb-4">
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
            className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-colors duration-200 hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6a4c9340] focus-visible:ring-offset-2 focus-visible:ring-offset-[#faf6f0]"
          >
            View all listings
          </Link>
        </div>

        <div className="relative">
          {showLeftFade ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-6 bg-gradient-to-r from-white/70 via-white/20 to-transparent md:block"
            />
          ) : null}
          {showRightFade ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-8 bg-gradient-to-l from-white/60 via-white/15 to-transparent md:block"
            />
          ) : null}
          <div
            ref={carouselRef}
            className="flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-4 sm:pr-6 xl:gap-4"
          >
            {visibleListings.map((listing, index) => {
              const href =
                mode === "customer" ? getCustomerListingUrl(listing) : getListingUrl(listing);
              const imageSrc =
                primaryPhotoUrl(listing.photo_url) || getListingCategoryPlaceholder(listing);
              const businessName =
                String(listing?.business_name || "").trim() || "Local business";
              const displayPriceCents = getDisplayPriceCents(listing);

              return (
                <Link
                  key={listing.public_id || listing.id || `${listing.title}-${index}`}
                  href={href}
                  prefetch={false}
                  className="group flex h-full w-[calc((100%-0.75rem)/2)] min-w-[calc((100%-0.75rem)/2)] flex-[0_0_auto] snap-start flex-col overflow-hidden rounded-[18px] border border-slate-200/80 bg-white shadow-sm transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8c73bb59] focus-visible:ring-offset-2 focus-visible:ring-offset-[#faf6f0] sm:w-[21rem] sm:min-w-[21rem] md:w-[17.25rem] md:min-w-[17.25rem] xl:w-[16rem] xl:min-w-[16rem]"
                >
                  <div className="relative aspect-[4/5] w-full overflow-hidden bg-stone-100 sm:aspect-[3/4]">
                    <Image
                      src={imageSrc}
                      alt={listing.title || "Listing"}
                      fill
                      sizes="(max-width: 639px) calc((100vw - 2rem - 0.75rem) / 2), (max-width: 767px) 21rem, (max-width: 1279px) 17.25rem, 16rem"
                      className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                    />
                  </div>

                  <div className="flex min-h-[88px] flex-1 flex-col justify-between px-3 pb-3 pt-3 sm:min-h-[104px] sm:px-4 sm:pb-4 sm:pt-3.5">
                    <div className="space-y-1.5 sm:space-y-2">
                      <h3 className="line-clamp-2 min-h-[2.35rem] text-sm font-semibold leading-[1.35] tracking-[-0.02em] text-slate-900 sm:min-h-[2.75rem] sm:text-[15px]">
                        {listing.title || "Untitled listing"}
                      </h3>
                      <p className="line-clamp-1 text-xs text-slate-500 sm:text-[13px]">
                        {businessName}
                      </p>
                    </div>
                    <p className="whitespace-nowrap text-sm font-semibold tracking-[-0.03em] text-slate-950 sm:text-[1.04rem]">
                      {displayPriceCents > 0 ? formatPriceCents(displayPriceCents) : formatPrice(listing.price)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </HomeSectionContainer>
    </section>
  );
}
