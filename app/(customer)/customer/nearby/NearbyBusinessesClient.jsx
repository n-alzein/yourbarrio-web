"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import FastImage from "@/components/FastImage";
import { primaryPhotoUrl } from "@/lib/listingPhotos";
import CustomerMap from "@/components/customer/CustomerMap";
import { BUSINESS_CATEGORIES, normalizeCategoryName } from "@/lib/businessCategories";
import { appendCrashLog } from "@/lib/crashlog";
import { logDataDiag } from "@/lib/dataDiagnostics";
import { useLocation } from "@/components/location/LocationProvider";
import { getCustomerBusinessUrl } from "@/lib/ids/publicRefs";

const isSameBusinessList = (prev, next) => {
  if (!Array.isArray(prev) || !Array.isArray(next)) return false;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    if (prev[i]?.id !== next[i]?.id) return false;
  }
  return true;
};

export default function NearbyBusinessesClient() {
  const searchParams = useSearchParams();
  const { user, loadingUser } = useAuth();
  const { theme, hydrated } = useTheme();
  const isLight = hydrated ? theme === "light" : true;
  const { location, hydrated: locationHydrated } = useLocation();
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
  const [userCity, setUserCity] = useState("");
  const locationKey = location.city ? `city:${location.city}` : "";
  const mapEnabled = process.env.NEXT_PUBLIC_HOME_BISECT_MAP !== "0";
  const mapAvailable = mapEnabled && process.env.NEXT_PUBLIC_DISABLE_MAP !== "1";
  const storageKey = locationKey
    ? `yb_customer_nearby_businesses_${locationKey}`
    : "yb_customer_nearby_businesses";
  const initialYb = (() => {
    if (typeof window === "undefined") return [];
    try {
      const cached = sessionStorage.getItem(storageKey);
      const parsed = cached ? JSON.parse(cached) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  const [ybBusinesses, setYbBusinesses] = useState(initialYb);
  const [ybBusinessesLoading, setYbBusinessesLoading] = useState(
    initialYb.length === 0
  );
  const [hasLoadedYb, setHasLoadedYb] = useState(initialYb.length > 0);
  const hasLoadedYbRef = useRef(hasLoadedYb);
  const [ybBusinessesError, setYbBusinessesError] = useState(null);
  const [isVisible, setIsVisible] = useState(() =>
    typeof document === "undefined" ? true : !document.hidden
  );
  const [showNearbySticky, setShowNearbySticky] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ybFetchedRef = useRef(false);
  const ybRequestIdRef = useRef(0);
  const galleryRef = useRef(null);
  const stickyBarRef = useRef(null);
  const showLocationEmpty = locationHydrated && !locationKey;
  const tileDragState = useRef({
    pointerId: null,
    pointerType: null,
    startX: 0,
    startY: 0,
    dragging: false,
    lastDragAt: 0,
  });

  const logCrashEvent = useCallback(
    (payload) =>
      appendCrashLog({
        type: "customer-nearby",
        ...payload,
      }),
    []
  );

  useEffect(() => {
    hasLoadedYbRef.current = hasLoadedYb;
  }, [hasLoadedYb]);

  useEffect(() => {
    if (!locationHydrated) return;
    if (!locationKey) {
      setYbBusinesses([]);
      setHasLoadedYb(true);
      setYbBusinessesLoading(false);
      setYbBusinessesError(null);
      return;
    }
    if (typeof window === "undefined") return;
    try {
      const cached = sessionStorage.getItem(storageKey);
      const parsed = cached ? JSON.parse(cached) : [];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setYbBusinesses(parsed);
        setHasLoadedYb(true);
        setYbBusinessesLoading(false);
        setYbBusinessesError(null);
        return;
      }
    } catch {
      /* ignore cache errors */
    }
    setYbBusinesses([]);
    setHasLoadedYb(false);
    setYbBusinessesLoading(true);
    setYbBusinessesError(null);
  }, [locationHydrated, locationKey, storageKey]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => setIsVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    if (!mapAvailable) return;
    setUserCity(location.city || "");
  }, [mapAvailable, location.city]);

  useEffect(() => {
    const urlQuery = (searchParams?.get("q") || "").trim();
    const urlCategory = (searchParams?.get("category") || "").trim();
    const normalizedUrlCategory = normalizeCategoryName(urlCategory).toLowerCase();
    const matchedCategory = BUSINESS_CATEGORIES.find(
      (category) =>
        normalizeCategoryName(category.name).toLowerCase() === normalizedUrlCategory
    );
    setSearch(urlQuery);
    setCategoryFilter(matchedCategory?.name || "All");
  }, [searchParams]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleScroll = () => {
      setShowNearbySticky(window.scrollY > 240);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const normalizeCity = (value) => (value || "").trim().toLowerCase();
  const businessesForMap = useMemo(() => {
    const normalizedUserCity = normalizeCity(userCity);
    const withCoords = (ybBusinesses || []).filter((biz) => {
      if (!biz) return false;
      const lat = biz.coords?.lat ?? biz.lat ?? biz.latitude;
      const lng = biz.coords?.lng ?? biz.lng ?? biz.longitude;
      const parsedLat = typeof lat === "number" ? lat : parseFloat(lat);
      const parsedLng = typeof lng === "number" ? lng : parseFloat(lng);
      return Number.isFinite(parsedLat) && Number.isFinite(parsedLng);
    });
    if (!normalizedUserCity) return withCoords;
    const filtered = withCoords.filter((biz) => {
      return normalizeCity(biz?.city) === normalizedUserCity;
    });
    return filtered.length ? filtered : withCoords;
  }, [ybBusinesses, userCity]);

  const businessPhotoFor = (biz) =>
    primaryPhotoUrl(
      biz?.imageUrl ||
        biz?.profile_photo_url ||
        biz?.photo_url ||
        biz?.image_url ||
        biz?.avatar_url ||
        biz?.logo_url
    ) || null;

  const filteredBusinesses = useMemo(() => {
    const q = search.trim().toLowerCase();
    const categoryFilterNormalized = categoryFilter.trim().toLowerCase();
    if (!q) {
      if (!categoryFilterNormalized || categoryFilterNormalized === "all") return ybBusinesses;
      return ybBusinesses.filter((biz) => {
        const categoryValue =
          biz.categoryLabel?.toLowerCase() ||
          biz.category?.toLowerCase() ||
          "";
        return categoryValue === categoryFilterNormalized;
      });
    }
    return ybBusinesses.filter((biz) => {
      const name = biz.name?.toLowerCase() || "";
      const category =
        biz.categoryLabel?.toLowerCase() ||
        biz.category?.toLowerCase() ||
        "";
      const desc = biz.description?.toLowerCase() || "";
      const matchesCategory =
        !categoryFilterNormalized ||
        categoryFilterNormalized === "all" ||
        category === categoryFilterNormalized;
      return (
        matchesCategory &&
        (name.includes(q) || category.includes(q) || desc.includes(q))
      );
    });
  }, [search, ybBusinesses, categoryFilter]);

  const scrollGallery = (dir) => {
    const el = galleryRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 320, behavior: "smooth" });
  };

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
    if (!locationHydrated || !locationKey) return undefined;
    if (!isVisible && ybFetchedRef.current) return undefined;
    let active = true;
    const loadYb = async () => {
      const requestId = ++ybRequestIdRef.current;
      ybFetchedRef.current = true;
      setYbBusinessesLoading((prev) => (hasLoadedYbRef.current ? prev : true));
      setYbBusinessesError(null);
      logDataDiag("request:start", { label: "nearby:yb-businesses", requestId });
      try {
        let rows = [];

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(
            () => controller.abort(new DOMException("Timeout", "AbortError")),
            12000
          );
          const params = new URLSearchParams();
        if (location.city) {
          params.set("city", location.city);
        }
          const url = params.toString()
            ? `/api/public-businesses?${params.toString()}`
            : "/api/public-businesses";
          const res = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          const payload = await res.json().catch(() => ({}));
          if (res.ok && Array.isArray(payload?.businesses)) {
            rows = payload.businesses;
          }
        } catch (errApi) {
          if (errApi?.name === "AbortError") {
            logCrashEvent({
              context: "public-businesses",
              kind: "timeout",
              message: "/api/public-businesses timed out after 12s",
            });
            if (active && requestId === ybRequestIdRef.current) {
              setYbBusinesses([]);
              setHasLoadedYb(true);
              setYbBusinessesError("Still loading businesses. Please refresh to retry.");
              setYbBusinessesLoading(false);
            }
            return;
          }
          console.warn("public-businesses endpoint failed", errApi);
        }

        if (!active || requestId !== ybRequestIdRef.current) return;

        if (!rows.length) {
          setYbBusinesses((prev) => (isSameBusinessList(prev, []) ? prev : []));
          setHasLoadedYb(true);
          setYbBusinessesError("No businesses available for this location yet.");
        } else {
          const parseNum = (val) => {
            if (typeof val === "number" && Number.isFinite(val)) return val;
            const parsed = parseFloat(val);
            return Number.isFinite(parsed) ? parsed : null;
          };
          const mapped = rows
            .map((row) => {
              const address = row.city ? `${row.address || ""}${row.address ? ", " : ""}${row.city}` : row.address || "";
              const lat = parseNum(row.latitude ?? row.lat ?? row.location_lat);
              const lng = parseNum(row.longitude ?? row.lng ?? row.location_lng);
              const hasCoords = typeof lat === "number" && typeof lng === "number" && lat !== 0 && lng !== 0;
              return {
                id: row.id,
                public_id: row.public_id || null,
                name: row.business_name || row.name || "Local business",
                category: row.category || "Local business",
                categoryLabel: row.category || "Local business",
                address,
                city: row.city || "",
                zip_code: row.zip_code || row.zip || "",
                description: row.description || row.bio || "",
                website: row.website || "",
                imageUrl: row.profile_photo_url || row.photo_url || "",
                source: "supabase_businesses",
                coords: hasCoords ? { lat, lng } : null,
              };
            })
            .filter(Boolean);
          const next = mapped.length ? mapped : [];
          setYbBusinesses((prev) => (isSameBusinessList(prev, next) ? prev : next));
          setHasLoadedYb(true);

          if (typeof window !== "undefined") {
            try {
              sessionStorage.setItem(
                storageKey,
                JSON.stringify(next)
              );
            } catch {
              /* ignore cache errors */
            }
          }
        }
      } catch (err) {
        console.warn("Failed to load YourBarrio businesses", err);
        if (!active || requestId !== ybRequestIdRef.current) return;
        setYbBusinesses((prev) => (isSameBusinessList(prev, []) ? prev : []));
        setHasLoadedYb(true);
        setYbBusinessesError("Could not load businesses yet. Please try again.");
      } finally {
        if (active && requestId === ybRequestIdRef.current) {
          setYbBusinessesLoading(false);
          logDataDiag("request:finish", {
            label: "nearby:yb-businesses",
            requestId,
          });
        }
      }
    };

    loadYb();

    return () => {
      active = false;
    };
  }, [logCrashEvent, isVisible, locationHydrated, locationKey, location.city, storageKey]);

  useEffect(() => {
    if (!ybBusinessesLoading) return;
    const timer = setTimeout(() => {
      setYbBusinessesLoading(false);
      setYbBusinessesError((prev) => prev || "Still loading businesses. Please try again.");
      logCrashEvent({
        context: "yb-businesses",
        kind: "timeout",
        message: "Businesses load exceeded 12s watchdog",
      });
    }, 12000);
    return () => clearTimeout(timer);
  }, [ybBusinessesLoading, logCrashEvent]);

  const renderNearbySection = (compact = false) => (
    <div
      className={`grid grid-cols-1 gap-2 mt-0 pointer-events-auto ${
        compact ? "" : "relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen"
      }`}
    >
      <div
        className={`border border-white/10 ${
          compact ? "bg-black/80 shadow-lg" : "bg-white/5 backdrop-blur-xl shadow-xl"
        } pointer-events-auto`}
      >
        {!compact ? (
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-5 sm:px-6 md:px-8 lg:px-12 pt-2 pb-1">
            <div className={`text-sm uppercase tracking-[0.18em] ${textTone.subtle}`}>
              Nearby businesses
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className={`inline-flex items-center gap-2 text-xs ${textTone.soft} bg-white/5 border border-white/10 px-3 py-1 backdrop-blur`}>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {filteredBusinesses.length} matches live
              </div>
              <button
                type="button"
                onClick={() => scrollGallery(-1)}
                className={`h-8 w-8 rounded-full border border-white/20 bg-white/5 ${textTone.base} hover:border-white/40`}
                aria-label="Scroll left"
              >
                <ChevronLeft className="h-4 w-4 mx-auto" />
              </button>
              <button
                type="button"
                onClick={() => scrollGallery(1)}
                className={`h-8 w-8 rounded-full border border-white/20 bg-white/5 ${textTone.base} hover:border-white/40`}
                aria-label="Scroll right"
              >
                <ChevronRight className="h-4 w-4 mx-auto" />
              </button>
            </div>
          </div>
        ) : null}
        <div
          ref={compact ? undefined : galleryRef}
          className={`flex flex-nowrap overflow-x-auto snap-x snap-mandatory ${
            compact ? "" : "border-t border-white/10 px-5 sm:px-6 md:px-8 lg:px-12"
          }`}
          onPointerDown={handleTilePointerDown}
          onPointerMove={handleTilePointerMove}
          onPointerUp={handleTilePointerUp}
          onPointerCancel={handleTilePointerCancel}
          onClickCapture={handleTileClickCapture}
        >
          {filteredBusinesses.map((biz, bizIndex) => (
            <Link
              key={biz.id || biz.name}
              href={biz?.id ? getCustomerBusinessUrl(biz) : "#"}
              prefetch={false}
              data-safe-nav="1"
              className={`${compact ? "h-[88px]" : "h-[220px]"} snap-start text-left border-r border-white/10 bg-white/5 hover:bg-white/10 transition shadow-sm rounded-none last:border-r-0 flex flex-col overflow-hidden`}
              style={{
                width: compact ? "200px" : "260px",
                minWidth: compact ? "200px" : "260px",
                maxWidth: compact ? "200px" : "260px",
                flex: compact ? "0 0 200px" : "0 0 260px",
              }}
              onClick={(event) => {
                if (!biz?.id) event.preventDefault();
              }}
            >
              <div className={`${compact ? "h-full" : "h-24"} w-full ${compact ? "" : "border-b border-white/10"} bg-white/5 flex items-center ${compact ? "gap-2 px-2" : "justify-center"} flex-shrink-0`}>
                {businessPhotoFor(biz) ? (
                  <div className={`${compact ? "h-14 w-14 shrink-0" : "h-full w-full"} relative`}>
                    <FastImage
                      src={businessPhotoFor(biz)}
                      alt={biz.name || "Business"}
                      className="block h-full w-full object-contain"
                      fallbackSrc="/business-placeholder.png"
                      fill
                      sizes={compact ? "56px" : "260px"}
                      priority={!compact && bizIndex < 3}
                      decoding="async"
                    />
                  </div>
                ) : (
                  <div className={`text-[11px] ${textTone.subtle}`}>No photo</div>
                )}
                {compact ? (
                  <div className="min-w-0">
                    <div className="text-sm font-semibold line-clamp-1 !text-white">
                      {biz.name}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className={`${compact ? "hidden" : "p-3 space-y-2"} flex-1 flex flex-col`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-base font-semibold line-clamp-1">
                      {biz.name}
                    </div>
                    <div className={`text-xs ${textTone.soft}`}>
                      {biz.categoryLabel || biz.category || "Local spot"}
                    </div>
                  </div>
                  {biz.distance_km ? (
                    <div className={`text-[11px] ${textTone.soft} bg-white/10 border border-white/10 px-2 py-1`}>
                      {biz.distance_km.toFixed(1)} km
                    </div>
                  ) : null}
                </div>
                {biz.address ? (
                  <div className={`text-xs ${textTone.subtle} line-clamp-1`}>{biz.address}</div>
                ) : (
                  <div className={`text-xs ${textTone.subtle}`}>&nbsp;</div>
                )}
                {biz.description ? (
                  <div className={`text-sm ${textTone.tint} leading-snug line-clamp-2`}>
                    {biz.description}
                  </div>
                ) : null}
              </div>
            </Link>
          ))}
          {!filteredBusinesses.length ? (
            <div className={`text-sm ${textTone.soft}`}>
              {ybBusinessesLoading ? "Loading businesses..." : ybBusinessesError || "No matches found."}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (loadingUser && !user) {
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
      className={`relative w-full min-h-screen ${textTone.base} pb-4 pt-0 -mt-14 md:-mt-12`}
    >
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#05010d]" />
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/40 via-fuchsia-900/30 to-black" />
        <div className="pointer-events-none absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-[120px]" />
        <div className="pointer-events-none absolute top-40 -right-24 h-[480px] w-[480px] rounded-full bg-pink-500/30 blur-[120px]" />
      </div>

      {showNearbySticky && mounted && !showLocationEmpty
        ? createPortal(
            <div
              className="fixed top-20 sm:top-20 inset-x-0 z-[4800] pointer-events-auto isolate will-change-transform"
              style={{
                transform: "translateZ(0)",
                WebkitBackfaceVisibility: "hidden",
                backfaceVisibility: "hidden",
              }}
            >
              <div className="w-full border-y border-white/10 bg-black/85 shadow-lg pointer-events-auto">
                <div
                  ref={stickyBarRef}
                  className="w-full px-5 sm:px-6 md:px-8 lg:px-12 py-2"
                >
                  {renderNearbySection(true)}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      <div className="w-full px-5 sm:px-6 md:px-8 lg:px-12 relative z-10">
        <div className="w-full max-w-none">
          {showLocationEmpty ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 text-sm text-white/70">
              Select a location to see nearby businesses.
            </div>
          ) : (
            <>
              {renderNearbySection(false)}
              <div className="mt-6 relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen">
                <CustomerMap
                  mapEnabled={mapAvailable}
                  mapBusinesses={businessesForMap}
                  enableSearch={false}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
