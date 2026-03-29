"use client";
/*
  HOME_BISECT FLAGS (toggle to isolate blockers on /customer/home):
    NEXT_PUBLIC_HOME_BISECT_MAP (default 1)
    NEXT_PUBLIC_HOME_BISECT_HOME_AUDIT (default 1)
    NEXT_PUBLIC_HOME_BISECT_PD_TRACER (default 1)
    NEXT_PUBLIC_HOME_BISECT_SAFE_NAV (default 0)
    NEXT_PUBLIC_HOME_BISECT_TILE_DIAG (default 1)
  Protocol: build prod, toggle one flag to 0 (or SAFE_NAV to 1), rebuild, and observe whether anchor clicks still get defaultPrevented. If a flag fixes it, the associated module is the culprit.
*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import React from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import dynamic from "next/dynamic";
import { primaryPhotoUrl } from "@/lib/listingPhotos";
import FastImage from "@/components/FastImage";
import {
  getAvailabilityBadgeStyle,
  normalizeInventory,
  sortListingsByAvailability,
} from "@/lib/inventory";
import { installPreventDefaultTracer } from "@/lib/tracePreventDefault";
import { installHomeNavInstrumentation } from "@/lib/navInstrumentation";
import { appendCrashLog } from "@/lib/crashlog";
import { dumpStallRecorder } from "@/lib/stallRecorder";
import { BUSINESS_CATEGORIES, normalizeCategoryName } from "@/lib/businessCategories";
import { logDataDiag } from "@/lib/dataDiagnostics";
import CategoryTilesGrid from "@/components/customer/CategoryTilesGrid";
import PopularNearYouSection from "@/components/home/PopularNearYouSection";
import { useLocation } from "@/components/location/LocationProvider";
import FeedbackSection from "@/components/browse/FeedbackSection";

const HomeGuard = dynamic(() => import("@/components/debug/HomeGuard"), { ssr: false });
function HomeGuardFallback() {
  const { theme, hydrated } = useTheme();
  const isLight = hydrated ? theme === "light" : true;
  const textBase = isLight ? "text-slate-900" : "text-white";
  const textMuted = isLight ? "text-slate-600" : "text-white/70";

  return (
    <div className={`min-h-screen ${textBase} relative px-6 pt-3`}>
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[#05010d] pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/40 via-fuchsia-900/30 to-black pointer-events-none" />
        <div className="absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-[120px] pointer-events-none" />
        <div className="absolute top-40 -right-24 h-[480px] w-[480px] rounded-full bg-pink-500/30 blur-[120px] pointer-events-none" />
      </div>
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-12 w-12 rounded-full border-4 border-white/10 border-t-white/70 animate-spin mx-auto" />
          <p className={`text-lg ${textMuted}`}>Loading your account...</p>
        </div>
      </div>
    </div>
  );
}
const SafeNavFallback = dynamic(() => import("@/components/nav/SafeNavFallback"), { ssr: false });
import GuaranteedNavCapture from "@/components/nav/GuaranteedNavCapture";

class CustomerHomeErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Something went wrong." };
  }

  componentDidCatch(error, info) {
    console.error("Customer home crashed", error, info);
    appendCrashLog({
      type: "react-error",
      message: error?.message,
      stack: error?.stack,
      info: info?.componentStack,
      route: "/customer/home",
    });
  }

  render() {
    if (this.state.hasError) {
      const isLight = this.props.isLight ?? true;
      const textBase = isLight ? "text-slate-900" : "text-white";
      const textMuted = isLight ? "text-slate-600" : "text-white/70";
      return (
        <div className={`min-h-screen flex items-center justify-center px-6 ${textBase}`}>
          <div className="max-w-md w-full space-y-4 text-center bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="text-xl font-semibold">Something went wrong</h2>
            <p className={`text-sm ${textMuted}`}>
              {this.state.message || "The page failed to load. Please try again."}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: "" });
                if (typeof window !== "undefined") window.location.reload();
              }}
              className="w-full py-3 rounded-xl font-semibold bg-white text-black hover:bg-white/90 transition"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function CustomerHomePageInner({ mode, featuredCategories, featuredCategoriesError, initialListings: _initialListings = [] }) {
  const searchParams = useSearchParams();
  const { user, loadingUser } = useAuth();
  const { theme, hydrated } = useTheme();
  const isLight = hydrated ? theme === "light" : true;
  const { location, hasLocation, hydrated: locationHydrated } = useLocation();
  // Slightly stronger light-theme tones to preserve contrast on white surfaces.
  const textTone = useMemo(
    () => ({
      base: isLight ? "text-slate-900" : "text-white",
      strong: isLight ? "text-slate-900" : "text-white/90",
      muted: isLight ? "text-slate-700" : "text-white/80",
      soft: isLight ? "text-slate-600" : "text-white/70",
      subtle: isLight ? "text-slate-500" : "text-white/60",
      faint: isLight ? "text-slate-600" : "text-white/50",
      tint: isLight ? "text-slate-700" : "text-white/75",
    }),
    [isLight]
  );
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const showLocationEmpty = locationHydrated && !hasLocation;
  // DEBUG_CLICK_DIAG
  const clickDiagEnabled = process.env.NEXT_PUBLIC_CLICK_DIAG === "1";
  const tileHitTestEnabled = process.env.NEXT_PUBLIC_DEBUG_NAV_PERF === "1";
  const homeBisect = {
    homeAudit: process.env.NEXT_PUBLIC_HOME_BISECT_HOME_AUDIT !== "0",
    pdTracer: process.env.NEXT_PUBLIC_HOME_BISECT_PD_TRACER !== "0",
    safeNav: process.env.NEXT_PUBLIC_HOME_BISECT_SAFE_NAV === "1",
    tileDiag: process.env.NEXT_PUBLIC_HOME_BISECT_TILE_DIAG !== "0",
  };
  const featuredCategoryList = useMemo(
    () => (Array.isArray(featuredCategories) ? featuredCategories : []),
    [featuredCategories]
  );
  const featuredCategoriesLoading = featuredCategories == null;
  const [hybridItems, setHybridItems] = useState([]);
  const [hybridItemsLoading, setHybridItemsLoading] = useState(false);
  const [hybridItemsError, setHybridItemsError] = useState(null);
  const hybridRequestIdRef = useRef(0);
  const isPublicMode = mode === "public";
  const authReady = isPublicMode ? true : !loadingUser || !!user;
  const tileDragState = useRef({
    pointerId: null,
    pointerType: null,
    startX: 0,
    startY: 0,
    dragging: false,
    lastDragAt: 0,
  });
  const [, setIsVisible] = useState(() =>
    typeof document === "undefined" ? true : !document.hidden
  );
  const logCrashEvent = useCallback(
    (payload) =>
      appendCrashLog({
        type: "customer-home",
        ...payload,
      }),
    []
  );


  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => setIsVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    if (!tileHitTestEnabled) return undefined;
    if (typeof document === "undefined") return undefined;
    const handleClickCapture = (event) => {
      try {
        const target = event.target;
        const tile = target?.closest?.('[data-layer="tile"], [data-safe-nav="1"]');
        if (!tile) return;
        const anchor = target?.closest?.("a[href]");
        console.log("[tile-hit-test]", {
          target: target?.tagName,
          currentTarget: event.currentTarget?.tagName,
          anchor: anchor?.getAttribute?.("href") || null,
        });
      } catch {
        /* ignore */
      }
    };
    document.addEventListener("click", handleClickCapture, true);
    return () => document.removeEventListener("click", handleClickCapture, true);
  }, [tileHitTestEnabled]);

  useEffect(() => {
    if (!clickDiagEnabled || !homeBisect.pdTracer) return undefined;
    const cleanup = installPreventDefaultTracer();
    return cleanup;
  }, [clickDiagEnabled, homeBisect.pdTracer]);

  useEffect(() => {
    if (!clickDiagEnabled) return undefined;
    installHomeNavInstrumentation({ enabled: true });
    return undefined;
  }, [clickDiagEnabled]);


  useEffect(() => {
    if (!clickDiagEnabled || !homeBisect.homeAudit) return undefined;
    const stringifyNode = (node) => {
      if (!node) return "null";
      if (node === document) return "document";
      if (node === window) return "window";
      if (!node.tagName) return node.nodeName || "unknown";
      const tag = node.tagName.toLowerCase();
      const cls = (node.className || "").toString().trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".");
      return `${tag}${cls ? `.${cls}` : ""}`;
    };
    const audit = (event) => {
      try {
        const { clientX = 0, clientY = 0 } = event;
        const top = document.elementFromPoint(clientX, clientY);
        const path = typeof event.composedPath === "function" ? event.composedPath() : [];
        const anchor = event.target?.closest?.("a[href]");
        console.log("[CLICK_DIAG] HOME_AUDIT", {
          type: event.type,
          phase: "capture",
          defaultPrevented: event.defaultPrevented,
          cancelBubble: event.cancelBubble,
          target: stringifyNode(event.target),
          top: stringifyNode(top),
          anchor: anchor?.getAttribute?.("href") || null,
          path: path.slice(0, 6).map(stringifyNode),
        });
      } catch {
        /* ignore */
      }
    };
    const anchorPrevented = (event) => {
      const a = event.target?.closest?.("a[href]");
      if (!a) return;
      queueMicrotask(() => {
        if (event.defaultPrevented) {
          console.warn("[ANCHOR_PREVENTED]", {
            href: a.getAttribute?.("href"),
            stack: new Error().stack,
          });
        }
      });
    };
    document.addEventListener("click", audit, { capture: true, passive: true });
    document.addEventListener("pointerdown", audit, { capture: true, passive: true });
    document.addEventListener("click", anchorPrevented, { capture: true, passive: true });
    return () => {
      document.removeEventListener("click", audit, { capture: true, passive: true });
      document.removeEventListener("pointerdown", audit, { capture: true, passive: true });
      document.removeEventListener("click", anchorPrevented, { capture: true, passive: true });
    };
  }, [clickDiagEnabled, homeBisect.homeAudit]);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEBUG_NAV_PERF !== "1") return undefined;
    if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") {
      return undefined;
    }
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        console.log("[longtask]", Math.round(entry.duration), "ms", entry);
      }
    });
    try {
      observer.observe({ entryTypes: ["longtask"] });
    } catch {
      return undefined;
    }
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEBUG_NAV_PERF !== "1") return undefined;
    if (typeof window === "undefined" || typeof requestAnimationFrame === "undefined") {
      return undefined;
    }
    let rafId = 0;
    let last = performance.now();
      const tick = (now) => {
        const delta = now - last;
        if (delta > 200) {
          console.log("[raf-stall]", Math.round(delta), "ms", new Date().toISOString());
          dumpStallRecorder("raf-stall");
        }
        last = now;
        rafId = requestAnimationFrame(tick);
      };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);
  useEffect(() => {
    if (!clickDiagEnabled || !homeBisect.pdTracer) return undefined;
    const cleanup = installPreventDefaultTracer();
    return cleanup;
  }, [clickDiagEnabled, homeBisect.pdTracer]);
  const diagTileClick =
    (label, tileId) =>
      (event) => {
        if (!clickDiagEnabled || !homeBisect.tileDiag) return;
        console.log(`[CLICK_DIAG] ${label}`, {
          tileId,
          defaultPrevented: event.defaultPrevented,
          target: event.target?.tagName,
          currentTarget: event.currentTarget?.tagName,
        });
        const hrefAttr = event.currentTarget?.getAttribute?.("href");
        if (hrefAttr) {
          console.log("[CLICK_DIAG] TILE_HREF", { tileId, href: hrefAttr });
        }
        queueMicrotask(() => {
          console.log("[CLICK_DIAG] TILE_POST", { tileId, href: window.location.href });
        });
      };
  const coverFor = (value) => primaryPhotoUrl(value) || null;
  const DRAG_DISTANCE_PX = 10;
  const DRAG_CANCEL_WINDOW_MS = 300;
  const handleTilePointerDown = useCallback((event) => {
    if (event.pointerType !== "touch") return;
    const state = tileDragState.current;
    state.pointerId = event.pointerId;
    state.pointerType = event.pointerType;
    state.startX = event.clientX;
    state.startY = event.clientY;
    state.dragging = false;
    state.lastDragAt = 0;
  }, []);
  const handleTilePointerMove = useCallback((event) => {
    const state = tileDragState.current;
    if (state.pointerType !== "touch" || state.pointerId !== event.pointerId) return;
    const dx = Math.abs(event.clientX - state.startX);
    const dy = Math.abs(event.clientY - state.startY);
    if (!state.dragging && (dx > DRAG_DISTANCE_PX || dy > DRAG_DISTANCE_PX)) {
      state.dragging = true;
    }
  }, []);
  const handleTilePointerUp = useCallback((event) => {
    const state = tileDragState.current;
    if (state.pointerType !== "touch" || state.pointerId !== event.pointerId) return;
    if (state.dragging) {
      state.lastDragAt = Date.now();
    }
    state.pointerId = null;
    state.pointerType = null;
    state.dragging = false;
  }, []);
  const handleTilePointerCancel = useCallback((event) => {
    const state = tileDragState.current;
    if (state.pointerType !== "touch" || state.pointerId !== event.pointerId) return;
    if (state.dragging) {
      state.lastDragAt = Date.now();
    }
    state.pointerId = null;
    state.pointerType = null;
    state.dragging = false;
  }, []);
  const handleTileClickCapture = useCallback((event) => {
    const { lastDragAt } = tileDragState.current;
    if (lastDragAt && Date.now() - lastDragAt < DRAG_CANCEL_WINDOW_MS) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  useEffect(() => {
    const urlQuery = (searchParams?.get("q") || "").trim();
    const urlCategory = (searchParams?.get("category") || "").trim();
    const normalizedUrl = normalizeCategoryName(urlCategory).toLowerCase();
    const matchedCategory = BUSINESS_CATEGORIES.find(
      (category) =>
        normalizeCategoryName(category.name).toLowerCase() === normalizedUrl
    );
    setSearch(urlQuery);
    setCategoryFilter(matchedCategory?.name || "All");
  }, [searchParams]);

  const sortedHybridItems = useMemo(
    () => sortListingsByAvailability(hybridItems),
    [hybridItems]
  );

  useEffect(() => {
    let isActive = true;
    const requestId = ++hybridRequestIdRef.current;
    const term = search.trim();
    const categoryValue = categoryFilter.trim();

    if (!hasLocation) {
      setHybridItems([]);
      setHybridItemsError("Select a location to search.");
      setHybridItemsLoading(false);
      return undefined;
    }

    if (!term) {
      setHybridItems([]);
      setHybridItemsError(null);
      setHybridItemsLoading(false);
      return undefined;
    }

    const loadHybridItems = async () => {
      setHybridItemsLoading(true);
      setHybridItemsError(null);
      logDataDiag("request:start", { label: "home:hybrid-search", requestId });

      const safe = term.replace(/[%_]/g, "");
      if (!safe) {
        setHybridItems([]);
        setHybridItemsLoading(false);
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(new DOMException("Timeout", "AbortError")),
        12000
      );

      try {
        const params = new URLSearchParams();
        params.set("q", safe);
        if (categoryValue && categoryValue !== "All") {
          params.set("category", categoryValue);
        }
        const response = await fetch(`/api/search?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));

        if (!isActive || requestId !== hybridRequestIdRef.current) return;

        if (!response.ok) {
          console.error("Hybrid item search failed", payload);
          setHybridItemsError("Could not load item matches right now.");
          setHybridItems([]);
        } else {
          setHybridItems(Array.isArray(payload?.items) ? payload.items : []);
        }
      } catch (err) {
        if (!isActive || requestId !== hybridRequestIdRef.current) return;
        if (err?.name === "AbortError") {
          logCrashEvent({
            context: "hybrid-search",
            kind: "timeout",
            message: "Hybrid search query timed out after 12s",
          });
          setHybridItemsError("Search is taking too long. Please try again.");
        } else {
          console.error("Hybrid item search threw", err);
          setHybridItemsError("Could not load item matches right now.");
        }
        setHybridItems([]);
      } finally {
        clearTimeout(timeoutId);
        if (isActive && requestId === hybridRequestIdRef.current) {
          setHybridItemsLoading(false);
          logDataDiag("request:finish", {
            label: "home:hybrid-search",
            requestId,
          });
        }
      }
    };

    loadHybridItems();

    return () => {
      isActive = false;
    };
  }, [search, logCrashEvent, categoryFilter, hasLocation]);

  if (!isPublicMode && loadingUser && !user) {
    return (
      <div className={`min-h-screen ${textTone.base} relative px-6 pt-3`}>
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-0 bg-[#05010d]" />
          <div className="absolute inset-0 bg-gradient-to-b from-purple-900/40 via-fuchsia-900/30 to-black" />
          <div className="pointer-events-none absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-[120px]" />
          <div className="pointer-events-none absolute top-40 -right-24 h-[480px] w-[480px] rounded-full bg-pink-500/30 blur-[120px]" />
        </div>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="h-12 w-12 rounded-full border-4 border-white/10 border-t-white/70 animate-spin mx-auto" />
            <p className={`text-lg ${textTone.muted}`}>Loading your account...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      className={`relative w-full min-h-screen ${textTone.base} pt-0 md:pt-0 mt-0`}
      data-clickdiag={clickDiagEnabled ? "home" : undefined}
    >

      {/* Background */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#05010d]" />
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/40 via-fuchsia-900/30 to-black" />
        <div className="pointer-events-none absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-[120px]" />
        <div className="pointer-events-none absolute top-40 -right-24 h-[480px] w-[480px] rounded-full bg-pink-500/30 blur-[120px]" />
      </div>

      <div
        className="w-full px-5 sm:px-6 md:px-8 lg:px-12 relative z-10"
        data-home-content="1"
      >
        <div className="w-full max-w-none">
          {showLocationEmpty ? (
            <div className="mb-4 rounded-2xl border border-white/12 bg-white/5 backdrop-blur-xl p-4 text-sm text-white/70">
              Select a location to see listings near you.
            </div>
          ) : null}
          {authReady ? (
            <>
              {search ? (
                <div className="rounded-2xl border border-white/12 bg-white/5 backdrop-blur-xl shadow-xl px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className={`text-[10px] uppercase tracking-[0.22em] ${textTone.subtle}`}>
                        AI picks
                      </p>
                      <p className="text-lg font-semibold">
                        Items matching “{search}”
                      </p>
                    </div>
                    <div className={`flex items-center gap-2 text-xs ${textTone.soft}`}>
                      {hybridItemsLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Scanning listings</span>
                        </>
                      ) : (
                        <>
                          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                          <span>{hybridItems.length} item hits</span>
                        </>
                      )}
                    </div>
                  </div>

                  {hybridItemsError ? (
                    <div className="mt-3 text-sm text-rose-200">
                      {hybridItemsError}
                    </div>
                  ) : null}

                  {!hybridItemsLoading && !hybridItemsError && hybridItems.length === 0 ? (
                    <div className={`mt-3 text-sm ${textTone.soft}`}>
                      No items yet. Try a category like “coffee”, “salon”, or “groceries”.
                    </div>
                  ) : null}

                  <div className="grid sm:grid-cols-2 gap-3 mt-3">
                    {sortedHybridItems.map((item, idx) => {
                      const inventory = normalizeInventory(item);
                      const badgeStyle = getAvailabilityBadgeStyle(
                        inventory.availability,
                        isLight
                      );
                      return (
                      <a
                        key={item.id}
                        href={`${isPublicMode ? "/listings" : "/customer/listings"}/${item.id}`}
                        className="group rounded-xl border border-white/12 bg-white/5 hover:border-white/30 hover:bg-white/10 transition overflow-hidden flex gap-3 pointer-events-auto touch-manipulation"
                        target="_self"
                        data-safe-nav="1"
                        data-clickdiag={clickDiagEnabled ? "tile" : undefined}
                        data-clickdiag-tile-id={clickDiagEnabled ? item.id : undefined}
                        data-clickdiag-bound={clickDiagEnabled ? "tile" : undefined}
                        onClickCapture={diagTileClick("REACT_TILE_CAPTURE", item.id || idx)}
                        onClick={diagTileClick("REACT_TILE_BUBBLE", item.id || idx)}
                      >
                        {coverFor(item.photo_url) ? (
                          <FastImage
                            src={coverFor(item.photo_url)}
                            alt={item.title || "Listing"}
                            className="h-20 w-20 object-cover rounded-lg border border-white/10"
                            fallbackSrc="/business-placeholder.png"
                            width={80}
                            height={80}
                            sizes="80px"
                            priority={idx < 2}
                            decoding="async"
                          />
                        ) : (
                          <div className={`h-20 w-20 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-[11px] ${textTone.subtle}`}>
                            No image
                          </div>
                        )}
                        <div className="flex-1 pr-2 py-2">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="text-sm font-semibold leading-snug">
                              {item.title}
                            </div>
                            {item.price ? (
                              <div className={`text-sm font-semibold ${textTone.strong}`}>
                                ${item.price}
                              </div>
                            ) : null}
                          </div>
                          <div className={`text-[11px] uppercase tracking-wide ${textTone.faint} mt-1`}>
                            {item.category || "Listing"}
                            {item.city ? ` · ${item.city}` : ""}
                          </div>
                          <span
                            className="mt-2 inline-flex items-center rounded-full border bg-transparent px-2 py-1 text-[10px] font-semibold"
                            style={
                              badgeStyle
                                ? { color: badgeStyle.color, borderColor: badgeStyle.border }
                                : undefined
                            }
                          >
                            {inventory.label}
                          </span>
                          {item.description ? (
                            <p className={`text-xs ${textTone.soft} mt-1 line-clamp-2`}>
                              {item.description}
                            </p>
                          ) : null}
                        </div>
                      </a>
                      );
                    })}
                  </div>
                </div>
              ) : null}

            </>
          ) : (
            <div className="space-y-4">
              <div className="h-12 w-32 rounded-full bg-white/5 border border-white/10" />
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-xl p-4 space-y-3">
                <div className="h-4 w-48 rounded bg-white/10" />
                <div className="h-4 w-64 rounded bg-white/10" />
                <div className="h-4 w-40 rounded bg-white/10" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <div className="lg:col-span-3 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-xl h-[240px]" />
                <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-xl h-[240px]" />
              </div>
            </div>
          )}
        </div>

        {!search && (
          <div
            className="relative z-10 mt-1 -mx-2 sm:mt-2 sm:-mx-3 md:-mx-4 lg:-mx-6"
            data-home-tiles="1"
          >
            <CategoryTilesGrid
              categories={featuredCategoryList}
              isLoading={featuredCategoriesLoading}
              error={featuredCategoriesError}
              title="Shop by category"
              viewAllHref="/listings"
              clickDiagEnabled={clickDiagEnabled}
              onTilePointerDown={handleTilePointerDown}
              onTilePointerMove={handleTilePointerMove}
              onTilePointerUp={handleTilePointerUp}
              onTilePointerCancel={handleTilePointerCancel}
              onTileClickCapture={handleTileClickCapture}
              diagTileClick={diagTileClick}
            />
          </div>
        )}

      </div>
      {!search ? <PopularNearYouSection mode={mode} /> : null}
      <FeedbackSection mode={mode} className="mt-5" />
    </section>
  );
}

export default function CustomerHomeClient({
  mode = "customer",
  featuredCategories,
  featuredCategoriesError,
  initialListings = [],
}) {
  const safeNavFlag = process.env.NEXT_PUBLIC_HOME_BISECT_SAFE_NAV === "1";
  const isPublicMode = mode === "public";
  const { theme, hydrated } = useTheme();
  const isLight = hydrated ? theme === "light" : true;
  const pageContent = (
    <>
      <GuaranteedNavCapture />
      <CustomerHomePageInner
        mode={mode}
        featuredCategories={featuredCategories}
        featuredCategoriesError={featuredCategoriesError}
        initialListings={initialListings}
      />
    </>
  );

  return (
    <CustomerHomeErrorBoundary isLight={isLight}>
      {safeNavFlag ? <SafeNavFallback /> : null}
      {isPublicMode ? (
        pageContent
      ) : (
        <HomeGuard fallback={<HomeGuardFallback />}>
          {pageContent}
        </HomeGuard>
      )}
    </CustomerHomeErrorBoundary>
  );
}
