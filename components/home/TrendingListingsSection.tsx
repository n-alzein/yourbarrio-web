"use client";

import { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { BrowseMode, ListingSummary } from "@/lib/browse/getHomeBrowseData";
import { resolveListingCoverImageUrl } from "@/lib/listingPhotos";
import { getListingCategoryPlaceholder } from "@/lib/taxonomy/placeholders";
import { getCustomerListingUrl, getListingUrl } from "@/lib/ids/publicRefs";
import { sortListingsByAvailability } from "@/lib/inventory";
import HomeSectionContainer from "@/components/home/HomeSectionContainer";
import { calculateListingPricing } from "@/lib/pricing";
import { getSeededListingBadgeLabel, isSeededListing } from "@/lib/seededListings";

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
  title,
  subtitle,
  limit = 8,
}: TrendingListingsSectionProps) {
  const visibleListings = useMemo(
    () => sortListingsByAvailability(Array.isArray(listings) ? listings : []).slice(0, limit),
    [limit, listings]
  );

  const resolvedTitle = useMemo(() => {
    if (title) return title;
    if (listings.length < 6) {
      return "Recently added in Long Beach";
    }
    return "Popular in Long Beach";
  }, [listings.length, title]);

  const resolvedSubtitle = useMemo(() => {
    if (subtitle) return subtitle;
    return "Local items available near you";
  }, [subtitle]);

  const viewAllHref = "/listings";

  if (!visibleListings.length) return null;

  return (
    <section className="relative z-20 -mt-4 w-full bg-[#fcfcfd] pb-5 pt-5 md:-mt-5 md:pb-6 md:pt-7">
      <HomeSectionContainer className="px-4 sm:px-6 md:px-8">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[rgba(88,28,135,0.8)]">
              Discover
            </p>
            <h2 className="mt-1 text-[1.55rem] font-semibold tracking-[-0.04em] text-slate-900 sm:text-[1.7rem]">
              {resolvedTitle}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{resolvedSubtitle}</p>
          </div>

          <Link
            href={viewAllHref}
            prefetch={false}
            className="inline-flex h-9 items-center justify-center gap-1 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm transition-colors duration-200 hover:border-slate-300 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6a4c9340] focus-visible:ring-offset-2 focus-visible:ring-offset-[#faf6f0]"
          >
            View all listings
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div
          data-testid="homepage-listings-grid"
          className="grid grid-cols-1 gap-x-3 gap-y-4 min-[480px]:grid-cols-2 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-5 lg:grid-cols-3 xl:grid-cols-4"
        >
          {visibleListings.map((listing, index) => {
            const href =
              mode === "customer" ? getCustomerListingUrl(listing) : getListingUrl(listing);
            const imageSrc =
              resolveListingCoverImageUrl(listing) || getListingCategoryPlaceholder(listing);
            const businessName =
              String(listing?.business_name || "").trim() || "Local business";
            const displayPriceCents = getDisplayPriceCents(listing);
            const seeded = isSeededListing(listing);

            return (
              <Link
                key={listing.public_id || listing.id || `${listing.title}-${index}`}
                href={href}
                prefetch={false}
                className="group flex h-full min-w-0 flex-col overflow-hidden rounded-[18px] border border-slate-200/80 bg-white shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8c73bb59] focus-visible:ring-offset-2 focus-visible:ring-offset-[#faf6f0]"
              >
                <div className="relative flex h-40 w-full items-center justify-center overflow-hidden border-b border-black/[0.04] bg-white sm:h-44 lg:h-40 xl:h-44">
                  {seeded ? (
                    <span className="absolute left-3 top-3 z-10 inline-flex items-center rounded-full border border-slate-300 bg-white/92 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                      {getSeededListingBadgeLabel(listing)}
                    </span>
                  ) : null}
                  <Image
                    src={imageSrc}
                    alt={listing.title || "Listing"}
                    fill
                    sizes="(max-width: 479px) calc(100vw - 2rem), (max-width: 1023px) calc((100vw - 4rem - 1rem) / 2), (max-width: 1279px) calc((100vw - 5rem - 2rem) / 3), calc((100vw - 5rem - 3rem) / 4)"
                    className="object-contain object-center p-2 transition-transform duration-200 ease-out group-hover:scale-[1.02]"
                  />
                </div>

                <div className="flex min-h-[78px] flex-1 flex-col justify-between px-3 pb-3 pt-2 sm:min-h-[84px] sm:px-3.5 sm:pb-3.5 sm:pt-2.5">
                  <div className="space-y-0.5">
                    <h3 className="line-clamp-2 min-h-[2.2rem] text-[0.95rem] font-semibold leading-[1.28] tracking-[-0.02em] text-slate-900 sm:min-h-[2.4rem] sm:text-[0.98rem]">
                      {listing.title || "Untitled listing"}
                    </h3>
                    <p className="whitespace-nowrap text-[0.92rem] font-semibold tracking-[-0.02em] text-slate-950 sm:text-[0.96rem]">
                      {displayPriceCents > 0
                        ? formatPriceCents(displayPriceCents)
                        : formatPrice(listing.price)}
                    </p>
                    <p className="line-clamp-1 text-[12px] text-slate-500 sm:text-[12.5px]">
                      {businessName}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </HomeSectionContainer>
    </section>
  );
}
