import {
  LISTING_MARKETPLACE_CARD_CLASS,
  LISTING_MARKETPLACE_CONTENT_CLASS,
  LISTING_MARKETPLACE_CTA_WRAPPER_CLASS,
  LISTING_MARKETPLACE_IMAGE_FRAME_CLASS,
} from "./ListingMarketplaceCard";

const skeletonShimmerClass =
  "bg-[linear-gradient(135deg,rgba(248,250,252,0.98)_0%,rgba(241,245,249,0.95)_42%,rgba(248,250,252,0.98)_100%)]";

export default function ListingMarketplaceCardSkeleton() {
  return (
    <div
      className={[LISTING_MARKETPLACE_CARD_CLASS, "overflow-hidden"].join(" ")}
      data-testid="listing-marketplace-card-skeleton"
      aria-hidden="true"
    >
      <div
        className={[
          LISTING_MARKETPLACE_IMAGE_FRAME_CLASS,
          skeletonShimmerClass,
          "before:absolute before:inset-0 before:animate-[shimmer_2.6s_ease-in-out_infinite] before:bg-[linear-gradient(110deg,transparent_20%,rgba(255,255,255,0.5)_50%,transparent_80%)] before:content-['']",
        ].join(" ")}
        data-testid="listing-marketplace-card-skeleton-image"
      >
        <div className="absolute inset-x-[10%] top-[14%] h-[72%] rounded-[18px] border border-white/70 bg-white/40" />
      </div>

      <div className={LISTING_MARKETPLACE_CONTENT_CLASS}>
        <div className="space-y-2">
          <div
            className="h-3.5 w-24 rounded-full bg-slate-200/85"
            data-testid="listing-marketplace-card-skeleton-business"
          />
          <div className="space-y-1.5" data-testid="listing-marketplace-card-skeleton-title">
            <div className="h-3.5 w-full rounded-full bg-slate-200/80" />
            <div className="h-3.5 w-4/5 rounded-full bg-slate-200/70" />
          </div>
          <div
            className="h-4 w-20 rounded-full bg-slate-300/60"
            data-testid="listing-marketplace-card-skeleton-price"
          />
        </div>
      </div>

      <div
        className={[
          LISTING_MARKETPLACE_CTA_WRAPPER_CLASS,
          "md:translate-y-0 md:opacity-100",
        ].join(" ")}
      >
        <div
          className="h-9 w-[7.25rem] rounded-lg border border-slate-200 bg-slate-100/90"
          data-testid="listing-marketplace-card-skeleton-cta"
        />
      </div>
    </div>
  );
}
