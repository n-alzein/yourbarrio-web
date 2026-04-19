"use client";

import Link from "next/link";
import { useState } from "react";
import { ShoppingCart } from "lucide-react";
import SafeImage from "@/components/SafeImage";
import { useCart } from "@/components/cart/CartProvider";
import { primaryPhotoUrl } from "@/lib/listingPhotos";
import { getListingUrl } from "@/lib/ids/publicRefs";
import {
  getAvailabilityBadgeStyle,
  normalizeInventory,
} from "@/lib/inventory";
import type { ListingItem } from "../types";

type ListingMediaMode = "product" | "lifestyle";

function formatPrice(value: ListingItem["price"]) {
  if (value === null || value === undefined || value === "") return "Price TBD";
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return `$${number.toFixed(2)}`;
}

function formatDistance(value?: number | null) {
  if (!Number.isFinite(Number(value))) return null;
  const rounded = Number(value);
  if (rounded < 0.1) return "Nearby";
  return `${rounded.toFixed(1)} mi`;
}

function getMediaImageClassName(mode: ListingMediaMode) {
  if (mode === "lifestyle") {
    return "h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]";
  }
  return "h-full w-full object-contain px-[8%] py-[7%] transition duration-500 group-hover:scale-[1.02]";
}

export default function ListingMarketplaceCard({
  listing,
  fallbackLocationLabel,
}: {
  listing: ListingItem;
  fallbackLocationLabel: string;
}) {
  const { addItem } = useCart();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const inventory = normalizeInventory(listing);
  const availability = getAvailabilityBadgeStyle(inventory);
  const isOutOfStock = inventory.availability === "out";
  const businessName =
    String(listing?.business_name || "").trim() || "Local business";
  const localLabel =
    formatDistance(listing?.distance_miles) ||
    String(listing?.city || "").trim() ||
    fallbackLocationLabel;
  const mediaMode: ListingMediaMode = "product";
  const listingHref = getListingUrl(listing);

  const handleAddToCart = async () => {
    if (!listing?.id || isOutOfStock || adding) return;
    setAdding(true);
    setAdded(false);
    const result = await addItem({
      listingId: String(listing.id),
      quantity: 1,
      listing,
      business: {
        id: listing.business_id,
        business_name: businessName,
      },
    });
    setAdding(false);
    if (!result?.error) {
      setAdded(true);
      window.setTimeout(() => setAdded(false), 1600);
    }
  };

  return (
    <div
      className="group flex h-full min-h-0 flex-col overflow-hidden rounded-[20px] border border-black/6 bg-white shadow-[0_12px_34px_-30px_rgba(15,23,42,0.22)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_18px_38px_-28px_rgba(15,23,42,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cff]/30 focus-visible:ring-offset-2"
    >
      <Link href={listingHref} className="flex min-h-0 flex-1 flex-col" prefetch={false}>
        <div className="relative aspect-[4/3] overflow-hidden bg-white">
          <div className="absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,rgba(255,255,255,0.42),rgba(255,255,255,0))]" />
          <SafeImage
            src={primaryPhotoUrl(listing.photo_url)}
            alt={listing.title || "Listing photo"}
            className={getMediaImageClassName(mediaMode)}
            sizes="(max-width: 767px) 50vw, (max-width: 1023px) 25vw, (max-width: 1439px) 20vw, 19vw"
            onError={() => {}}
            onLoad={() => {}}
          />
          {availability ? (
            <span className={`${availability.className} absolute left-2.5 top-2.5`}>
              {availability.label}
            </span>
          ) : null}
        </div>

        <div className="grid min-h-[114px] flex-1 grid-rows-[auto_minmax(3.15rem,3.15rem)_auto] gap-1 px-3 pb-2.5 pt-2.5">
          <p className="text-[0.94rem] font-semibold tracking-[-0.03em] text-slate-950">
            {formatPrice(listing.price)}
          </p>
          <h3 className="line-clamp-3 max-h-[3.15rem] text-[0.86rem] font-semibold leading-[1.22] tracking-[-0.022em] text-slate-900">
            {listing.title || "Untitled listing"}
          </h3>
          <p className="line-clamp-1 self-end text-[0.72rem] text-slate-500/90">
            {`by ${businessName} • ${localLabel}`}
          </p>
        </div>
      </Link>
      <div className="px-3 pb-3 pt-0.5">
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={isOutOfStock || adding}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#d8d0f3] bg-[#f3f0ff] px-3 text-xs font-semibold text-slate-900 transition hover:border-[#c7bdec] hover:bg-[#ebe6fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cff]/25 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
        >
          <ShoppingCart className="h-4 w-4 text-current" />
          {adding ? "Adding..." : added ? "Added" : "Add to cart"}
        </button>
      </div>
    </div>
  );
}
