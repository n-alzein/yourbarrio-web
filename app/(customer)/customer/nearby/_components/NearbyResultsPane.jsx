"use client";

import NearbyBusinessCard from "./NearbyBusinessCard";

function NearbyCardSkeleton() {
  return (
    <div className="grid w-full animate-pulse grid-cols-[92px_1fr] gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <div className="h-[92px] w-[92px] rounded-xl bg-white/10" />
      <div className="space-y-2">
        <div className="h-4 w-3/4 rounded bg-white/10" />
        <div className="h-3 w-2/3 rounded bg-white/10" />
        <div className="h-3 w-full rounded bg-white/10" />
        <div className="h-3 w-5/6 rounded bg-white/10" />
      </div>
    </div>
  );
}

export default function NearbyResultsPane({
  businesses,
  loading,
  error,
  isMobile = false,
  activeBusinessId,
  selectedBusinessId,
  onCardHover,
  onCardLeave,
  onCardClick,
  onCardMapFocusClick,
  registerCard,
  onResetFilters,
}) {
  if (loading) {
    return (
      <div className="space-y-3" data-testid="nearby-results-list" aria-busy="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <NearbyCardSkeleton key={`nearby-skeleton-${index}`} />
        ))}
      </div>
    );
  }

  if (!businesses.length) {
    return (
      <div
        className="rounded-2xl border border-dashed border-white/20 bg-white/[0.03] px-5 py-8 text-center"
        data-testid="nearby-results-empty"
      >
        <p className="text-base font-semibold text-white">No nearby matches yet</p>
        <p className="mt-2 text-sm text-white/70">
          {error || "Try another search or expand your radius to discover more places."}
        </p>
        <button
          type="button"
          onClick={onResetFilters}
          className="mt-4 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:border-white/35"
        >
          Try another search
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="nearby-results-list">
      {businesses.map((business) => (
        <NearbyBusinessCard
          key={business.id || business.name}
          business={business}
          active={activeBusinessId === business.id}
          selected={selectedBusinessId === business.id}
          onHover={onCardHover}
          onLeave={onCardLeave}
          onClick={onCardClick}
          onMapFocusClick={onCardMapFocusClick}
          isMobile={isMobile}
          registerCard={registerCard}
        />
      ))}
    </div>
  );
}
