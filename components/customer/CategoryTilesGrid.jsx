"use client";

import { useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { markNavInProgress } from "@/lib/nav/safariNavGuard";

const FALLBACK_TILES = Array.from({ length: 8 });
const CATEGORY_IMAGE_POSITIONS = {
  "arts-and-crafts": "center center",
  automotive: "center center",
  "baby-and-maternity": "center 35%",
  "books-and-media": "center 32%",
  "clothing-and-accessories": "center 28%",
  "fitness-and-wellness": "center 30%",
  "food-and-drink": "center 38%",
  furniture: "center center",
  "garden-and-outdoor": "center 35%",
  "grocery-and-gourmet": "center 40%",
  "handmade-and-artisan": "center 30%",
  "health-and-beauty": "center 28%",
  "home-and-kitchen": "center 34%",
  "jewelry-and-watches": "center 25%",
  "kids-and-family": "center 30%",
  photography: "center center",
  shoes: "center 36%",
  "sports-and-outdoors": "center 32%",
  "tech-and-electronics": "center center",
  "toys-and-games": "center 34%",
};

function CategoryActionCue() {
  return (
    <span className="inline-flex shrink-0 items-center justify-center self-end text-[rgba(88,28,135,0.7)] transition-all duration-250 ease-out group-hover:translate-x-[2px] group-hover:-translate-y-[2px] group-hover:text-[rgba(88,28,135,1)] group-focus-visible:translate-x-[2px] group-focus-visible:-translate-y-[2px] group-focus-visible:text-[rgba(88,28,135,1)]">
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        className="h-[1.05rem] w-[1.05rem] transition-transform duration-250 ease-out"
      >
        <path
          d="M6 14L14 6M8 6h6v6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export default function CategoryTilesGrid({
  categories = [],
  isLoading = false,
  error = null,
  title = "Shop by category",
  viewAllHref = "/listings",
  viewAllLabel = "View all",
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
      <div className="mx-auto w-full max-w-none px-1 sm:px-3 lg:px-0">
        <div className="rounded-[32px] border border-black/5 bg-[linear-gradient(180deg,#fdfbf8_0%,#f7f2eb_100%)] px-4 py-5 shadow-[0_20px_50px_-36px_rgba(15,23,42,0.28)] sm:px-5 md:px-6 md:py-7">
          <div className="mb-6 flex items-center justify-between">
            <div className="h-7 w-44 rounded-full bg-black/8 animate-pulse" />
            <div className="h-10 w-24 rounded-full bg-black/8 animate-pulse" />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-3 lg:gap-5">
            {FALLBACK_TILES.map((_, idx) => (
              <div
                key={`tile-skeleton-${idx}`}
                className="overflow-hidden rounded-[30px] border border-black/[0.04] bg-[#fdfbf8] shadow-[0_16px_34px_-24px_rgba(20,18,26,0.16)]"
              >
                <div className="aspect-[4/5] bg-black/[0.06] animate-pulse lg:aspect-[5/4]" />
                <div className="-mt-20 px-4 pb-5 sm:px-5 sm:pb-6">
                  <div className="flex items-end justify-between gap-3">
                    <div className="space-y-2">
                      <div className="h-4 w-24 rounded-full bg-white/30 animate-pulse" />
                      <div className="h-4 w-20 rounded-full bg-white/22 animate-pulse" />
                    </div>
                    <div className="h-4 w-4 rounded-full bg-white/26 animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!hasCategories) {
    return (
      <div className="mx-auto w-full max-w-none px-1 sm:px-3 lg:px-0">
        <div className="rounded-[32px] border border-black/5 bg-[linear-gradient(180deg,#fdfbf8_0%,#f7f2eb_100%)] px-4 py-5 text-sm text-slate-600 shadow-[0_20px_50px_-36px_rgba(15,23,42,0.28)] sm:px-5 md:px-6 md:py-7">
          {error ? "Categories are unavailable right now." : "No categories yet."}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-none px-1 sm:px-3 lg:px-0">
      <section className="relative overflow-hidden rounded-[32px] border border-[#2f234208] bg-[linear-gradient(180deg,#fdfbf8_0%,#faf6f0_52%,#f7f1eb_100%)] px-4 py-5 shadow-[0_22px_52px_-40px_rgba(15,23,42,0.2),inset_0_1px_0_rgba(255,255,255,0.6)] sm:px-5 sm:py-6 md:px-7 md:py-7 lg:px-8 lg:py-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(106,76,147,0.14),transparent)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/70 via-white/24 to-transparent"
        />
        <div className="relative mb-5 flex flex-wrap items-end justify-between gap-x-5 gap-y-3 sm:mb-6 md:mb-7">
          <div className="max-w-[34rem]">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[rgba(88,28,135,0.8)]">
              Browse local
            </p>
            <h2 className="mt-1 text-[1.35rem] font-semibold tracking-[-0.035em] text-[#17141f] sm:text-[1.55rem] lg:text-[1.72rem]">
              {title}
            </h2>
            {error ? (
              <p className="mt-2 text-sm text-slate-600">{error}</p>
            ) : null}
          </div>
          {viewAllHref ? (
            <Link
              href={viewAllHref}
              prefetch={false}
              className="inline-flex h-10 items-center justify-center rounded-full border border-[#43365f1f] bg-white/78 px-4.5 text-sm font-medium text-[#352d43] shadow-[0_10px_26px_-24px_rgba(15,23,42,0.2)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#6a4c9338] hover:bg-[#f7f2fb] hover:text-[#231c31] hover:shadow-[0_14px_30px_-24px_rgba(106,76,147,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6a4c9340] focus-visible:ring-offset-2 focus-visible:ring-offset-[#faf6f0]"
            >
              {viewAllLabel}
            </Link>
          ) : null}
        </div>
        <div
          className="yb-tile-scroll-guard-y grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-3 lg:gap-5"
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
            const imageObjectPosition =
              CATEGORY_IMAGE_POSITIONS[category.slug] || "center center";
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
                className="tile group relative isolate overflow-hidden rounded-[30px] border border-black/[0.04] bg-[#fdfbf8] shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-all duration-250 ease-out hover:-translate-y-[3px] hover:shadow-[0_12px_32px_rgba(0,0,0,0.12),0_4px_12px_rgba(88,28,135,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8c73bb66] focus-visible:ring-offset-2 focus-visible:ring-offset-[#faf6f0] pointer-events-auto touch-manipulation"
              >
                <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[inherit] bg-[linear-gradient(180deg,#d9c7b5_0%,#b59882_100%)] lg:aspect-[5/4]">
                  {category.tileImageUrl ? (
                    <Image
                      src={category.tileImageUrl}
                      alt={tileTitle}
                      className="h-full w-full object-cover brightness-[1.03] transition-transform duration-250 ease-out will-change-transform group-hover:scale-[1.045] group-focus-visible:scale-[1.045]"
                      style={{ objectPosition: imageObjectPosition }}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 33vw"
                      priority={idx < 3}
                      decoding="async"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                      No image
                    </div>
                  )}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.55)_0%,rgba(0,0,0,0.25)_35%,rgba(0,0,0,0)_70%)]"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.12)_0%,rgba(0,0,0,0.05)_18%,rgba(0,0,0,0)_42%)]"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(88,28,135,0.18)_0%,rgba(0,0,0,0.45)_35%,rgba(0,0,0,0)_70%)] opacity-0 transition-opacity duration-250 ease-out group-hover:opacity-100 group-focus-visible:opacity-100"
                  />
                  <div className="absolute inset-x-0 bottom-0 z-10 p-[1.05rem] sm:p-[1.2rem] lg:p-[1.45rem]">
                    <div className="flex items-end justify-between gap-3">
                      <h3 className="max-w-[12ch] text-[1.03rem] font-bold leading-[1.08] tracking-[-0.03em] text-[rgba(255,255,255,0.96)] [text-wrap:balance] drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)] sm:text-[1.12rem] lg:text-[1.2rem]">
                        {tileTitle}
                      </h3>
                      <CategoryActionCue />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
