"use client";

import Link from "next/link";
import FastImage from "@/components/FastImage";
import { ArrowUpRight } from "lucide-react";
import { primaryPhotoUrl } from "@/lib/listingPhotos";
import { getListingUrl } from "@/lib/ids/publicRefs";

function formatPrice(value) {
  if (value === null || value === undefined || value === "") return "Price TBD";
  const number = Number(value);
  if (Number.isNaN(number)) return value;
  return `$${number.toFixed(2).replace(/\\.00$/, "")}`;
}

export default function BusinessListingsGrid({ listings, className = "" }) {
  return (
    <section
      className={`rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 md:p-8 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.7)] ${className}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold">Listings</h2>
          <p className="text-sm text-white/70">Shop their latest offers.</p>
        </div>
      </div>

      {!listings?.length ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
          No listings available yet.
        </div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((item) => {
            const cover = primaryPhotoUrl(item.photo_url);
            return (
              <Link
                key={item.id}
                href={getListingUrl(item)}
                className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition shadow-lg"
              >
                <div className="relative h-48 w-full overflow-hidden bg-white/5 border-b border-white/10">
                  <FastImage
                    src={cover || "/business-placeholder.png"}
                    alt={item.title || "Listing"}
                    className="object-contain p-3 transition-transform duration-300 group-hover:scale-[1.02]"
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    decoding="async"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <p className="text-xs uppercase tracking-wide text-white/60">
                    {item.category_info?.name || item.category || "Listing"}
                    {item.city ? ` - ${item.city}` : ""}
                  </p>
                  <h3 className="text-base font-semibold text-white line-clamp-2">
                    {item.title || "Untitled listing"}
                  </h3>
                  <div className="mt-auto flex items-center justify-between">
                    <span className="text-lg font-semibold text-white">
                      {formatPrice(item.price)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-white/70">
                      View
                      <ArrowUpRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
