import ListingMarketplaceCardSkeleton from "./components/ListingMarketplaceCardSkeleton";
import { LISTING_MARKETPLACE_GRID_CLASS } from "./components/ListingMarketplaceCard";

export default function ListingsLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-5 pb-8 pt-6 sm:px-6 lg:px-8">
      <div className="max-w-2xl">
        <div className="h-10 w-72 rounded-full bg-slate-200/70" />
        <div className="mt-3 h-11 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_-28px_rgba(15,23,42,0.16)]" />
      </div>
      <div className="mt-6 border-t border-black/6 pt-4">
        <div className={LISTING_MARKETPLACE_GRID_CLASS}>
          {Array.from({ length: 10 }).map((_, index) => (
            <ListingMarketplaceCardSkeleton key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
