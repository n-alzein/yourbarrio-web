"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocation } from "@/components/location/LocationProvider";
import { sortListingsByAvailability } from "@/lib/inventory";
import { calculateListingPricing } from "@/lib/pricing";
import {
  getListingsBrowseCategoryOptions,
  normalizeListingsBrowseCategory,
} from "@/lib/listings/browseCategories";
import { getLocationCacheKey } from "@/lib/location";
import { installNetTrace } from "@/lib/netTrace";
import ListingMarketplaceCard from "./components/ListingMarketplaceCard";
import ListingsToolbar from "./components/ListingsToolbar";
import type { ListingItem } from "./types";

const CATEGORY_OPTIONS = getListingsBrowseCategoryOptions();

const SORT_OPTIONS = [
  { value: "recommended", label: "Recommended" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
];

const PRICE_OPTIONS = [
  { value: "all", label: "Any price" },
  { value: "under-50", label: "Under $50" },
  { value: "under-100", label: "Under $100" },
  { value: "premium", label: "$100+" },
];

const DISTANCE_OPTIONS = [
  { value: "any", label: "Anywhere nearby" },
  { value: "in-city", label: "In this city" },
  { value: "closest", label: "Closest first" },
];

function normalizeText(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizePrice(value: ListingItem["price"]) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDisplayPrice(listing: ListingItem) {
  const finalPriceCents = Number(listing?.finalPriceCents);
  if (Number.isFinite(finalPriceCents) && finalPriceCents > 0) return finalPriceCents / 100;
  const computed = calculateListingPricing(listing?.price).finalPriceCents;
  return computed > 0 ? computed / 100 : normalizePrice(listing?.price);
}

function getResultErrorMessage(error: unknown) {
  if (typeof error === "string") return error.trim() || null;
  if (!error || typeof error !== "object") return null;

  const candidate = error as { message?: unknown; error?: unknown };
  if (typeof candidate.message === "string" && candidate.message.trim()) {
    return candidate.message.trim();
  }
  if (typeof candidate.error === "string" && candidate.error.trim()) {
    return candidate.error.trim();
  }
  return null;
}

function LoadingGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 18 }).map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_12px_32px_-30px_rgba(15,23,42,0.22)]"
        >
          <div className="aspect-[4/3] animate-pulse bg-white" />
          <div className="grid min-h-[96px] grid-rows-[auto_minmax(2.3rem,2.3rem)_auto] gap-1 px-3 pb-3 pt-2.5">
            <div className="h-4 w-20 rounded-full bg-slate-200/70" />
            <div className="space-y-1">
              <div className="h-4 w-full rounded-full bg-slate-200/70" />
              <div className="h-4 w-4/5 rounded-full bg-slate-200/70" />
            </div>
            <div className="h-3.5 w-2/3 self-end rounded-full bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function FiltersModal({
  open,
  onClose,
  category,
  onCategoryChange,
  priceFilter,
  onPriceChange,
  distanceFilter,
  onDistanceChange,
  openNow,
  onOpenNowToggle,
}: {
  open: boolean;
  onClose: () => void;
  category: string;
  onCategoryChange: (value: string) => void;
  priceFilter: string;
  onPriceChange: (value: string) => void;
  distanceFilter: string;
  onDistanceChange: (value: string) => void;
  openNow: boolean;
  onOpenNowToggle: () => void;
}) {
  if (!open) return null;

  const fieldClassName =
    "h-11 w-full rounded-2xl border border-black/5 bg-white px-3 text-sm text-slate-700 shadow-[0_10px_30px_-28px_rgba(15,23,42,0.24)] outline-none transition focus:border-[#7c5cff26] focus:bg-[#faf7ff]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/28 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-[28px] bg-[#fcfcfe] p-5 shadow-[0_28px_80px_-36px_rgba(15,23,42,0.42)]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Filters</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/5 bg-white text-slate-500 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cff]/30"
            aria-label="Close filters"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">Category</span>
            <select
              value={category}
              onChange={(event) => onCategoryChange(event.target.value)}
              className={fieldClassName}
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">Price</span>
            <select
              value={priceFilter}
              onChange={(event) => onPriceChange(event.target.value)}
              className={fieldClassName}
            >
              {PRICE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">Distance</span>
            <select
              value={distanceFilter}
              onChange={(event) => onDistanceChange(event.target.value)}
              className={fieldClassName}
            >
              {DISTANCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center justify-between rounded-2xl border border-black/5 bg-white px-3 py-3 shadow-[0_10px_30px_-28px_rgba(15,23,42,0.24)]">
            <span className="text-sm font-medium text-slate-700">Open now</span>
            <button
              type="button"
              onClick={onOpenNowToggle}
              className={[
                "relative inline-flex h-7 w-12 items-center rounded-full transition",
                openNow ? "bg-[#7c5cff]" : "bg-slate-200",
              ].join(" ")}
              aria-pressed={openNow}
            >
              <span
                className={[
                  "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition",
                  openNow ? "translate-x-6" : "translate-x-1",
                ].join(" ")}
              />
            </button>
          </label>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-full border border-[#7c5cff1f] bg-[#f5f0ff] px-4 text-sm font-medium text-[#4b2aad] transition hover:bg-[#efe7ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cff]/30"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ListingsClient() {
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState<{ message?: string } | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [sortBy, setSortBy] = useState("recommended");
  const [priceFilter, setPriceFilter] = useState("all");
  const [distanceFilter, setDistanceFilter] = useState("any");
  const [openNow, setOpenNow] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { location, hydrated: locationHydrated } = useLocation();
  const searchTerm = searchParams.get("q")?.trim() || "";
  const rawCategory = searchParams.get("category")?.trim() || "";
  const normalizedCategory = normalizeListingsBrowseCategory(rawCategory);
  const category = normalizedCategory.canonical || "all";
  const invalidCategory = Boolean(rawCategory) && !normalizedCategory.isValid;
  const locationKey = getLocationCacheKey(location);
  const cacheKey = `${locationKey}::${searchTerm || "all"}::${category}`;
  const hasLocation = locationKey !== "none";
  const showLocationEmpty = locationHydrated && !hasLocation;
  const marketCity = String(location?.city || "").trim() || "Long Beach";
  const didInitTraceRef = useRef(false);
  const loggedErrorRef = useRef<string | null>(null);

  const sortedListings = useMemo(
    () => sortListingsByAvailability(Array.isArray(listings) ? listings : []),
    [listings]
  );

  const filteredListings = useMemo(() => {
    const priceFiltered = sortedListings.filter((listing) => {
      const amount = normalizeDisplayPrice(listing);
      if (priceFilter === "under-50") return amount !== null && amount < 50;
      if (priceFilter === "under-100") return amount !== null && amount < 100;
      if (priceFilter === "premium") return amount !== null && amount >= 100;
      return true;
    });

    const distanceFiltered = priceFiltered.filter((listing) => {
      if (distanceFilter !== "in-city") return true;
      return normalizeText(listing?.city) === normalizeText(marketCity);
    });

    const withDistanceOrder =
      distanceFilter === "closest"
        ? [...distanceFiltered].sort((left, right) => {
            const leftInCity = normalizeText(left?.city) === normalizeText(marketCity) ? 0 : 1;
            const rightInCity = normalizeText(right?.city) === normalizeText(marketCity) ? 0 : 1;
            return leftInCity - rightInCity;
          })
        : distanceFiltered;

    const openFiltered = openNow
      ? withDistanceOrder.filter((listing) => {
          const status = normalizeText(listing?.inventory_status);
          if (!status) return true;
          return !["out of stock", "out_of_stock", "unavailable", "sold out"].includes(status);
        })
      : withDistanceOrder;

    if (sortBy === "newest") {
      return [...openFiltered].sort(
        (left, right) =>
          new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime()
      );
    }

    if (sortBy === "price-asc") {
      return [...openFiltered].sort((left, right) => {
        const leftPrice = normalizeDisplayPrice(left);
        const rightPrice = normalizeDisplayPrice(right);
        if (leftPrice === null) return 1;
        if (rightPrice === null) return -1;
        return leftPrice - rightPrice;
      });
    }

    if (sortBy === "price-desc") {
      return [...openFiltered].sort((left, right) => {
        const leftPrice = normalizeDisplayPrice(left);
        const rightPrice = normalizeDisplayPrice(right);
        if (leftPrice === null) return 1;
        if (rightPrice === null) return -1;
        return rightPrice - leftPrice;
      });
    }

    return openFiltered;
  }, [distanceFilter, marketCity, openNow, priceFilter, sortBy, sortedListings]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (priceFilter !== "all") count += 1;
    if (distanceFilter !== "any") count += 1;
    if (openNow) count += 1;
    return count;
  }, [distanceFilter, openNow, priceFilter]);

  useEffect(() => {
    if (didInitTraceRef.current) return;
    didInitTraceRef.current = true;
    if (process.env.NEXT_PUBLIC_LISTINGS_NETTRACE === "1") {
      installNetTrace({ enabled: true, tag: "LISTINGS" });
      const onError = (event: ErrorEvent) => {
        console.error("[LISTINGS][window:error]", {
          message: event?.message,
          filename: event?.filename,
          lineno: event?.lineno,
          colno: event?.colno,
          error: event?.error?.stack || event?.error,
        });
      };
      const onUnhandled = (event: PromiseRejectionEvent) => {
        console.error("[LISTINGS][window:unhandledrejection]", {
          reason: event?.reason?.stack || event?.reason,
        });
      };
      window.addEventListener("error", onError);
      window.addEventListener("unhandledrejection", onUnhandled);
      return () => {
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onUnhandled);
      };
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (!rawCategory) return;
    if (!normalizedCategory.isValid) return;
    if (normalizedCategory.isAlias) {
      const next = new URLSearchParams(searchParams.toString());
      next.set("category", normalizedCategory.canonical);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }
  }, [
    normalizedCategory.canonical,
    normalizedCategory.isAlias,
    normalizedCategory.isValid,
    pathname,
    rawCategory,
    router,
    searchParams,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasLocation) return;
    if (invalidCategory) return;
    try {
      const raw = sessionStorage.getItem(cacheKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) {
        setListings(parsed);
        setHasLoaded(true);
        setLoading(false);
      }
    } catch {
      // ignore cache errors
    }
  }, [cacheKey, hasLocation, invalidCategory]);

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoading(false), 8000);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (invalidCategory) {
      setListings([]);
      setLoadError(null);
      setHasLoaded(true);
      setLoading(false);
      if (process.env.NODE_ENV !== "production") {
        console.info("[listings] invalid category param", { rawCategory });
      }
      return undefined;
    }

    if (!hasLocation) {
      setListings([]);
      setLoadError(null);
      setHasLoaded(true);
      setLoading(false);
      return undefined;
    }

    let active = true;
    const controller = new AbortController();

    async function getListingsSafe({ signal }: { signal: AbortSignal }) {
      try {
        const params = new URLSearchParams();
        if (searchTerm) params.set("q", searchTerm);
        if (category !== "all") params.set("category", category);
        params.set("limit", "120");
        const response = await fetch(`/api/home-listings?${params.toString()}`, {
          signal,
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          return { ok: false, error: payload, status: response.status };
        }
        return { ok: true, data: Array.isArray(payload?.listings) ? payload.listings : [] };
      } catch (error: any) {
        const message = typeof error?.message === "string" ? error.message : "";
        const isAbort =
          error?.name === "AbortError" || message.toLowerCase().includes("aborted");
        if (isAbort) {
          return { ok: false, aborted: true, error };
        }
        return { ok: false, error };
      }
    }

    async function load() {
      setLoading((prev) => (hasLoaded ? prev : true));
      setLoadError(null);
      try {
        const result = await getListingsSafe({ signal: controller.signal });
        if (!active) return;
        if (!result.ok) {
          if (result.aborted) return;
          const requestKey = `${searchTerm || "all"}::${category}`;
          const errorMessage =
            getResultErrorMessage(result.error) || "We couldn't load listings right now.";
          if (loggedErrorRef.current !== requestKey) {
            loggedErrorRef.current = requestKey;
            if (process.env.NODE_ENV !== "production") {
              console.warn("[LISTINGS][load:warn]", {
                route: "/listings",
                request: "api:home-listings",
                status: result.status ?? null,
                message: errorMessage,
              });
            }
          }
          setLoadError({
            message: errorMessage,
          });
          setListings([]);
          return;
        }
        const next = result.data;
        setListings(next);
        setHasLoaded(true);
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(next));
          } catch {
            // ignore cache errors
          }
        }
      } catch (error) {
        console.error("Failed to load listings", error);
        if (active) setListings([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [cacheKey, category, hasLoaded, hasLocation, invalidCategory, rawCategory, retryKey, searchTerm]);

  function updateQueryParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (!value || value === "all") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <>
      <div>
        <div className="mx-auto w-full max-w-7xl px-5 pb-8 pt-3 sm:px-6 lg:px-8">
          {(searchTerm || category !== "all") && (
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center text-sm text-slate-500 transition hover:text-slate-900"
            >
              ← Go back
            </button>
          )}

          <section className="pb-3 pt-4">
            <h1 className="text-[2rem] font-semibold tracking-[-0.055em] text-slate-950 sm:text-[2.35rem]">
              {`Explore listings in ${marketCity}`}
            </h1>

            <div className="mt-3">
              <ListingsToolbar
                category={category}
                onCategoryChange={(value) => updateQueryParam("category", value)}
                sortBy={sortBy}
                onSortChange={setSortBy}
                onOpenFilters={() => setFiltersOpen(true)}
                categoryOptions={CATEGORY_OPTIONS}
                sortOptions={SORT_OPTIONS}
                activeFilterCount={activeFilterCount}
              />
            </div>
          </section>

          {showLocationEmpty ? (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-[#fbfbfd] p-6 text-slate-600">
              Select a location to see listings near you.
            </div>
          ) : loadError ? (
            <div className="rounded-[24px] border border-red-200 bg-red-50 p-5 text-red-700">
              <div className="font-semibold">Unable to load listings</div>
              <p className="mt-1 text-sm">{loadError.message}</p>
              <button
                type="button"
                onClick={() => setRetryKey((prev) => prev + 1)}
                className="mt-3 inline-flex items-center rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
              >
                Try again
              </button>
            </div>
          ) : null}

          {!showLocationEmpty && !loadError ? (
            <>
              <div className="mt-3 border-t border-black/6" />
              <div className="pb-2 pt-3">
                {!loading ? (
                  <p className="text-sm text-slate-400">
                    {filteredListings.length} {filteredListings.length === 1 ? "listing" : "listings"}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}

          {!loading && !loadError && !showLocationEmpty && filteredListings.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-[#fbfbfd] p-6 text-slate-600">
              {invalidCategory
                ? "That category filter is invalid."
                : "No listings match the current filters."}
            </div>
          ) : null}

          <div className="pt-1">
            {loading && !showLocationEmpty && !loadError ? <LoadingGridSkeleton /> : null}

            {!loading && !loadError && !showLocationEmpty ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
                {filteredListings.map((listing, index) => (
                  <ListingMarketplaceCard
                    key={listing.public_id || listing.id || `${listing.title}-${index}`}
                    listing={listing}
                    fallbackLocationLabel={marketCity}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <FiltersModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        category={category}
        onCategoryChange={(value) => updateQueryParam("category", value)}
        priceFilter={priceFilter}
        onPriceChange={setPriceFilter}
        distanceFilter={distanceFilter}
        onDistanceChange={setDistanceFilter}
        openNow={openNow}
        onOpenNowToggle={() => setOpenNow((current) => !current)}
      />
    </>
  );
}
