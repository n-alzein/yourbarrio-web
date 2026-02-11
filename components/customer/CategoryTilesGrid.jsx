"use client";

import { useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { markNavInProgress } from "@/lib/nav/safariNavGuard";

const FALLBACK_TILES = Array.from({ length: 8 });

export default function CategoryTilesGrid({
  categories = [],
  isLoading = false,
  error = null,
  title = "Shop by category",
  viewAllHref = "/listings",
  viewAllLabel = "View all",
  textTone,
  clickDiagEnabled = false,
  onTileClickCapture,
  onTilePointerDown,
  onTilePointerMove,
  onTilePointerUp,
  onTilePointerCancel,
  diagTileClick,
}) {
  const debugNavPerf = process.env.NEXT_PUBLIC_DEBUG_NAV_PERF === "1";
  const hasCategories = Array.isArray(categories) && categories.length > 0;

  const markNavStart = useCallback(() => {
    if (!debugNavPerf) return;
    try {
      performance.mark("cat_nav_click");
    } catch {
      /* ignore */
    }
  }, [debugNavPerf]);

  if (isLoading) {
    return (
      <div className="w-full px-0 sm:px-4 lg:px-0 max-w-none mx-auto">
        <div className="mb-4 flex items-center justify-between">
          <div className="h-6 w-40 rounded bg-white/10 animate-pulse" />
          <div className="h-4 w-20 rounded bg-white/10 animate-pulse" />
        </div>
        <div className="grid gap-4 lg:gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-3">
          {FALLBACK_TILES.map((_, idx) => (
            <div
              key={`tile-skeleton-${idx}`}
              className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
            >
              <div className="aspect-[4/5] lg:aspect-[16/9] bg-white/10 animate-pulse" />
              <div className="p-3">
                <div className="h-4 w-3/4 bg-white/10 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!hasCategories) {
    return (
      <div className="w-full px-0 sm:px-4 lg:px-0 max-w-none mx-auto">
        <div className="text-sm text-white/70 mt-2">
          {error ? "Categories are unavailable right now." : "No categories yet."}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="w-full px-0 sm:px-4 lg:px-0 max-w-none mx-auto">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl lg:text-lg font-semibold text-white">
              {title}
            </h2>
            {error ? (
              <p className="mt-1 text-sm text-white/70">{error}</p>
            ) : null}
          </div>
          {viewAllHref ? (
            <Link
              href={viewAllHref}
              prefetch={false}
              className="text-sm font-semibold text-white/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded-md px-2 py-1"
            >
              {viewAllLabel}
            </Link>
          ) : null}
        </div>
        <div
          className="grid gap-4 lg:gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 yb-tile-scroll-guard-y"
          onPointerDown={onTilePointerDown}
          onPointerMove={onTilePointerMove}
          onPointerUp={onTilePointerUp}
          onPointerCancel={onTilePointerCancel}
          onClickCapture={onTileClickCapture}
          data-home-category-grid="1"
        >
          {categories.map((category, idx) => {
            const href = `/categories/${category.slug}`;
            const tileTitle = category.name || "Category";
            return (
              <Link
                key={category.id ?? category.slug ?? idx}
                href={href}
                prefetch={false}
                aria-label={`Shop ${tileTitle}`}
                data-layer="tile"
                data-safe-nav="1"
                data-category-tile="1"
                data-prefetch-href={href}
                data-clickdiag={clickDiagEnabled ? "tile" : undefined}
                data-clickdiag-tile-id={clickDiagEnabled ? category.slug || idx : undefined}
                data-clickdiag-bound={clickDiagEnabled ? "tile" : undefined}
                onPointerDown={(event) => {
                  if (!debugNavPerf) return;
                  try {
                    performance.mark("cat_pointer_down");
                  } catch {
                    /* ignore */
                  }
                }}
                onPointerDownCapture={() => {
                  markNavInProgress(href);
                }}
                onClickCapture={
                  diagTileClick ? diagTileClick("REACT_TILE_CAPTURE", category.slug || idx) : undefined
                }
                onClick={(event) => {
                  if (diagTileClick) {
                    const handler = diagTileClick("REACT_TILE_BUBBLE", category.slug || idx);
                    if (typeof handler === "function") handler(event);
                  }
                  if (debugNavPerf) {
                    try {
                      performance.mark("cat_click_handler");
                      performance.measure(
                        "pointerdown_to_click_handler",
                        "cat_pointer_down",
                        "cat_click_handler"
                      );
                      const entry = performance
                        .getEntriesByName("pointerdown_to_click_handler")
                        .slice(-1)[0];
                      console.log(
                        "[perf] pointerdown_to_click_handler(ms)",
                        entry?.duration
                      );
                    } catch {
                      /* ignore */
                    }
                  }
                  markNavStart();
                }}
                onNavigate={markNavStart}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-sm transition-colors duration-200 hover:shadow-md hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 pointer-events-auto touch-manipulation active:bg-white/10 tile"
              >
                <div className="relative aspect-[4/5] lg:aspect-[16/9] w-full overflow-hidden bg-white/5">
                  {category.tileImageUrl ? (
                    <Image
                      src={category.tileImageUrl}
                      alt={tileTitle}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 33vw"
                      priority={idx < 3}
                      decoding="async"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs text-white/60">
                      No image
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <h3 className="text-sm sm:text-base lg:text-sm font-semibold !text-white drop-shadow-sm line-clamp-2">
                      {tileTitle}
                    </h3>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
