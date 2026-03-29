"use client";

import Image from "next/image";
import Link from "next/link";
import { resolveBusinessImageSrc } from "@/lib/placeholders/businessPlaceholders";
import { getBusinessTypeLabel } from "@/lib/taxonomy/compat";

type BusinessCardProps = {
  business: {
    public_id?: string | null;
    business_name?: string | null;
    business_type?: string | null;
    category?: string | null;
    city?: string | null;
    state?: string | null;
    profile_photo_url?: string | null;
    cover_photo_url?: string | null;
    distanceMiles?: number | null;
  };
};

function formatDistance(distanceMiles?: number | null) {
  if (typeof distanceMiles !== "number" || !Number.isFinite(distanceMiles)) return null;
  return `${distanceMiles.toFixed(1)} mi`;
}

function formatLocationLine(business: BusinessCardProps["business"]) {
  const city = String(business?.city || "").trim();
  const distance = formatDistance(business?.distanceMiles);

  if (city && distance) return `${city} • ${distance}`;
  return city || distance || null;
}

export function getBusinessImage(business: BusinessCardProps["business"]) {
  return resolveBusinessImageSrc({
    imageUrl: business?.cover_photo_url || business?.profile_photo_url || null,
    businessType: business?.business_type,
    legacyCategory: business?.category,
  });
}

export default function BusinessCard({ business }: BusinessCardProps) {
  const href = `/customer/b/${business?.public_id || ""}`;
  const imageSrc = getBusinessImage(business);
  const categoryLabel = getBusinessTypeLabel(business, "Local business");
  const businessName = String(business?.business_name || "Local business").trim();
  const locationLine = formatLocationLine(business);

  return (
    <Link
      href={href}
      prefetch={false}
      className="group relative flex w-[280px] min-w-[280px] snap-start flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_10px_30px_rgba(124,58,237,0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-200 focus-visible:ring-offset-2 md:w-full md:min-w-0"
    >
      <div className="relative h-[180px] w-full overflow-hidden rounded-t-2xl bg-stone-100">
        <Image
          src={imageSrc}
          alt={businessName}
          fill
          sizes="(max-width: 767px) 280px, (max-width: 1279px) 33vw, 280px"
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-black/5 to-transparent" />
        <div className="absolute left-3 top-3 rounded-full border border-purple-100 bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm">
          {categoryLabel}
        </div>
      </div>

      <div className="flex flex-1 items-start justify-between gap-3 px-4 pb-4 pt-3.5">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-tight tracking-[-0.02em] text-slate-900">
            {businessName}
          </h3>
          {locationLine ? (
            <p className="mt-1.5 text-sm text-slate-500">{locationLine}</p>
          ) : (
            <p className="mt-1.5 text-sm text-slate-400">Nearby business</p>
          )}
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
    </Link>
  );
}
