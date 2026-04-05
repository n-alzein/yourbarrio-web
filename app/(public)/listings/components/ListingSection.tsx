"use client";

import ListingMarketplaceCard from "./ListingMarketplaceCard";
import type { ListingItem } from "../types";

type ListingSectionProps = {
  title: string;
  subtitle?: string | null;
  listings: ListingItem[];
  locationLabel: string;
};

export default function ListingSection({
  title,
  subtitle,
  listings,
  locationLabel,
}: ListingSectionProps) {
  if (!listings.length) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-slate-950 sm:text-[1.35rem]">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {listings.map((listing, index) => (
          <ListingMarketplaceCard
            key={listing.public_id || listing.id || `${listing.title}-${index}`}
            listing={listing}
            fallbackLocationLabel={locationLabel}
          />
        ))}
      </div>
    </section>
  );
}
