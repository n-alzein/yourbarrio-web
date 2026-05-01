"use client";

import { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import type { BrowseMode, ListingSummary } from "@/lib/browse/getHomeBrowseData";
import { resolveListingCoverImageUrl } from "@/lib/listingPhotos";
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
  variant?: "featured" | "new";
  excludeListingIds?: Array<string | null | undefined>;
};

function formatPrice(value?: number | string | null): string {
  if (value === null || value === undefined || value === "") return "Price TBD";
  const number = Number(value);
  if (Number.isNaN(number)) return "Price TBD";
  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getDisplayPriceCents(listing: ListingSummary) {
  const finalPriceCents = Number(listing?.finalPriceCents);
  if (Number.isFinite(finalPriceCents) && finalPriceCents > 0) return finalPriceCents;
  return calculateListingPricing(listing?.price).finalPriceCents;
}

function formatPriceCents(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "Price TBD";
  return formatPrice(value / 100);
}

function getListingKey(listing: ListingSummary) {
  return String(listing?.public_id || listing?.id || "").trim();
}

function getTime(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getFreshListings({
  listings,
  excludeListingIds,
  limit,
}: {
  listings: ListingSummary[];
  excludeListingIds: Set<string>;
  limit: number;
}) {
  const sorted = [...listings].sort((left, right) => {
    const rightTime = Math.max(getTime(right?.inventory_last_updated_at), getTime(right?.created_at));
    const leftTime = Math.max(getTime(left?.inventory_last_updated_at), getTime(left?.created_at));
    return rightTime - leftTime;
  });
  const distinct = sorted.filter((listing) => !excludeListingIds.has(getListingKey(listing)));

  if (distinct.length >= limit) return distinct.slice(0, limit);

  const reused = sorted.filter((listing) => excludeListingIds.has(getListingKey(listing)));
  const rotatedReuse =
    reused.length > 1 ? [...reused.slice(Math.ceil(reused.length / 2)), ...reused.slice(0, Math.ceil(reused.length / 2))] : reused;

  return [...distinct, ...rotatedReuse].slice(0, limit);
}

export default function TrendingListingsSection({
  mode = "public",
  listings = [],
  title,
  subtitle,
  limit = 8,
  variant = "featured",
  excludeListingIds = [],
}: TrendingListingsSectionProps) {
  const safeListings = useMemo(
    () => (Array.isArray(listings) ? listings : []),
    [listings]
  );
  const excludedKeys = useMemo(
    () => new Set(excludeListingIds.map((id) => String(id || "").trim()).filter(Boolean)),
    [excludeListingIds]
  );
  const visibleListings = useMemo(() => {
    if (variant === "new") {
      return getFreshListings({
        listings: sortListingsByAvailability(safeListings),
        excludeListingIds: excludedKeys,
        limit,
      });
    }
    return sortListingsByAvailability(safeListings).slice(0, limit);
  }, [excludedKeys, limit, safeListings, variant]);

  const resolvedTitle = useMemo(() => {
    if (title) return title;
    if (variant === "new") return "New this week";
    return "Featured in Long Beach";
  }, [title, variant]);

  const resolvedSubtitle = useMemo(() => {
    const trimmed = String(subtitle || "").trim();
    return trimmed || null;
  }, [subtitle]);

  const viewAllHref = "/listings";
  const isNewSection = variant === "new";

  if (!visibleListings.length) return null;

  return (
    <section
      className={
        isNewSection
          ? "relative z-20 w-full bg-[#fafbff] pb-5 pt-4 md:pb-6 md:pt-5"
          : "relative z-20 -mt-2 w-full bg-[#fcfcfd] pb-4 pt-4 md:-mt-3 md:pb-5 md:pt-5"
      }
    >
      <HomeSectionContainer className="px-4 sm:px-6 md:px-8">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3 md:mb-5">
          <div className="min-w-0">
            {isNewSection ? (
              <p className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Fresh finds
              </p>
            ) : null}
            <h2 className="text-[1.55rem] font-semibold tracking-[-0.04em] text-slate-900 sm:text-[1.7rem]">
              {resolvedTitle}
            </h2>
            {resolvedSubtitle ? (
              <p className="mt-1 text-sm text-slate-500">{resolvedSubtitle}</p>
            ) : null}
          </div>

          {!isNewSection ? (
            <Link
              href={viewAllHref}
              prefetch={false}
              className="inline-flex items-center justify-center text-sm font-medium text-slate-600 transition-colors duration-200 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6a4c9340] focus-visible:ring-offset-2 focus-visible:ring-offset-[#faf6f0]"
            >
              View all listings →
            </Link>
          ) : null}
        </div>

        <div
          data-testid="homepage-listings-grid"
          className={
            isNewSection
              ? "flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              : "grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-3 md:gap-x-4 md:gap-y-6 lg:grid-cols-4 lg:gap-y-6"
          }
        >
          {visibleListings.map((listing, index) => {
            const href =
              mode === "customer" ? getCustomerListingUrl(listing) : getListingUrl(listing);
            const imageSrc =
              resolveListingCoverImageUrl(listing) || getListingCategoryPlaceholder(listing);
            const businessName =
              String(listing?.business_name || "").trim() || "Local business";
            const displayPriceCents = getDisplayPriceCents(listing);
            const displayPrice =
              displayPriceCents > 0 ? formatPriceCents(displayPriceCents) : formatPrice(listing.price);

            return (
              <Link
                key={listing.public_id || listing.id || `${listing.title}-${index}`}
                href={href}
                prefetch={false}
                className={
                  isNewSection
                    ? "group flex h-full w-[42vw] min-w-[42vw] snap-start flex-col gap-1 transition-transform duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8c73bb59] focus-visible:ring-offset-2 focus-visible:ring-offset-[#faf6f0] sm:w-[190px] sm:min-w-[190px] md:w-[210px] md:min-w-[210px] lg:w-[220px] lg:min-w-[220px]"
                    : "group flex h-full min-w-0 flex-col gap-1 transition-transform duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8c73bb59] focus-visible:ring-offset-2 focus-visible:ring-offset-[#faf6f0] md:gap-1.5"
                }
              >
                <div
                  className={
                    isNewSection
                      ? "relative aspect-[5/3.6] w-full overflow-hidden rounded-2xl bg-white"
                      : "relative aspect-[4/3] w-full overflow-hidden rounded-[20px] bg-white"
                  }
                >
                  <Image
                    src={imageSrc}
                    alt={listing.title || "Listing"}
                    fill
                    sizes="(max-width: 767px) calc((100vw - 2rem - 0.75rem) / 2), (max-width: 1023px) calc((100vw - 4rem - 2rem) / 3), calc((100vw - 5rem - 3rem) / 4)"
                    className="object-contain object-center p-1.5 transition-transform duration-200 ease-out group-hover:scale-105 sm:p-2"
                  />
                </div>

                <div className="mt-1 md:mt-1.5">
                  <div className="space-y-0">
                    <p className="whitespace-nowrap text-[15px] font-semibold tracking-[-0.02em] text-slate-950 md:text-base">
                      {displayPrice}
                    </p>
                    <h3 className="line-clamp-2 pt-px text-sm font-medium leading-tight tracking-[-0.01em] text-slate-800">
                      {listing.title || "Untitled listing"}
                    </h3>
                    <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">
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
