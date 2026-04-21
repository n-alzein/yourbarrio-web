"use client";

import NearbyBusinessCard from "./NearbyBusinessCard";

function NearbyCardSkeleton() {
  return (
    <div className="grid w-full animate-pulse gap-4 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-[168px_1fr]">
      <div className="h-44 rounded-2xl bg-slate-100 sm:h-36" />
      <div className="space-y-2">
        <div className="h-5 w-3/4 rounded bg-slate-100" />
        <div className="h-4 w-2/3 rounded bg-slate-100" />
        <div className="h-4 w-full rounded bg-slate-100" />
        <div className="h-10 w-28 rounded-full bg-slate-100" />
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
  onToggleSaveShop,
  savedBusinessIds,
  savingBusinessIds,
  showSaveControls = true,
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
        className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center"
        data-testid="nearby-results-empty"
      >
        <p className="text-lg font-semibold text-slate-950">
          {error ? "Growing in your area" : "No matches for these filters"}
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
          {error || "Explore local businesses near your area by clearing the current search or category filter."}
        </p>
        <button
          type="button"
          onClick={onResetFilters}
          className="mt-5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:border-violet-200 hover:text-violet-700"
        >
          Reset filters
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5" data-testid="nearby-results-list">
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
          onToggleSave={onToggleSaveShop}
          isSaved={savedBusinessIds?.has?.(business.id)}
          saveLoading={savingBusinessIds?.has?.(business.id)}
          showSaveControl={showSaveControls}
          isMobile={isMobile}
          registerCard={registerCard}
        />
      ))}
    </div>
  );
}
