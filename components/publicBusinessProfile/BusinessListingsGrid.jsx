"use client";

import Link from "next/link";
import FastImage from "@/components/FastImage";
import { ArrowUpRight } from "lucide-react";
import { primaryPhotoUrl } from "@/lib/listingPhotos";
import { descriptionSnippet } from "@/lib/listingDescription";
import { getListingUrl } from "@/lib/ids/publicRefs";
import { getListingCategoryLabel } from "@/lib/taxonomy/compat";
import { getListingCategoryPlaceholder } from "@/lib/taxonomy/placeholders";
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

export default function BusinessListingsGrid({
  listings,
  className = "",
  title = "Listings",
  description = "Available offers from this business.",
  headerAction = null,
  itemHrefResolver = getListingUrl,
}) {
  const gridClassName =
    "grid justify-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(208px,208px))] max-sm:[grid-template-columns:repeat(auto-fill,minmax(168px,168px))]";

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
          detail="Current inventory and featured offers will show up here."
        />
      ) : (
        <div className={gridClassName}>
          {listings.map((item) => {
            const cover = primaryPhotoUrl(item.photo_url);
            return (
              <Link
                key={item.id}
                href={itemHrefResolver(item)}
                className="group flex h-full min-h-[258px] flex-col overflow-hidden rounded-[20px] border border-slate-200/80 bg-white transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_40px_-30px_rgba(15,23,42,0.28)] max-sm:min-h-[236px]"
              >
                <div className="relative aspect-[1.08/1] overflow-hidden bg-slate-100">
                  <FastImage
                    src={cover || getListingCategoryPlaceholder(item)}
                    alt={item.title || "Listing"}
                    className="object-cover transition duration-300 group-hover:scale-[1.02]"
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    decoding="async"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                      {getListingCategoryLabel(item, "Listing")}
                    </p>
                    <span className="text-xs font-medium text-slate-400">
                      {item.city || ""}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-[0.98rem] font-semibold tracking-[-0.02em] text-slate-950 line-clamp-2">
                      {item.title || "Untitled listing"}
                    </h3>
                    {item.description ? (
                      <p className="mt-1 text-[13px] leading-5 text-slate-600 line-clamp-2">
                        {descriptionSnippet(item.description, 120)}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                    <span className="text-base font-semibold text-slate-950">
                      {formatPrice(item.price)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[#5b37d6]">
                      View
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </ProfileSection>
  );
}
