"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { primaryPhotoUrl } from "@/lib/listingPhotos";
import SafeImage from "@/components/SafeImage";
import { useSearchParams, useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { useLocation } from "@/components/location/LocationProvider";
import {
  getAvailabilityBadgeStyle,
  normalizeInventory,
  sortListingsByAvailability,
} from "@/lib/inventory";
import { installNetTrace } from "@/lib/netTrace";
import { resolveCategoryIdByName } from "@/lib/categories";
import { getListingUrl } from "@/lib/ids/publicRefs";

function formatPrice(value) {
  if (value === null || value === undefined || value === "") return "Price TBD";
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return `$${number.toFixed(2)}`;
}

function splitPrice(value) {
  const formatted = formatPrice(value);
  if (formatted === "Price TBD") {
    return { formatted, dollars: null, cents: null };
  }
  const normalized = formatted.replace("$", "");
  const [dollars, cents = "00"] = normalized.split(".");
  return { formatted, dollars, cents };
}

export default function ListingsClient() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);
  const searchParams = useSearchParams();
  const router = useRouter();
  const { theme, hydrated } = useTheme();
  const isLight = hydrated ? theme === "light" : true;
  const { location, hydrated: locationHydrated } = useLocation();
  const category = searchParams.get("category")?.trim();
  const searchTerm = searchParams.get("q")?.trim();
  const showListView = Boolean(category);
  const locationKey = location.city ? `city:${location.city}` : "none";
  const cacheKey = `${locationKey}::${category || "all"}::${searchTerm || "all"}`;
  const hasLocation = Boolean(location.city);
  const showLocationEmpty = locationHydrated && !hasLocation;
  const sortedListings = useMemo(
    () => sortListingsByAvailability(listings),
    [listings]
  );
  const didInitTraceRef = useRef(false);
  const loggedErrorRef = useRef(null);

  useEffect(() => {
    if (didInitTraceRef.current) return;
    didInitTraceRef.current = true;
    if (process.env.NEXT_PUBLIC_LISTINGS_NETTRACE === "1") {
      installNetTrace({ enabled: true, tag: "LISTINGS" });
      const onError = (event) => {
        console.error("[LISTINGS][window:error]", {
          message: event?.message,
          filename: event?.filename,
          lineno: event?.lineno,
          colno: event?.colno,
          error: event?.error?.stack || event?.error,
        });
      };
      const onUnhandled = (event) => {
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
  // Hydrate from session cache so the page feels instant on back/forward
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasLocation) return;
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
  }, [cacheKey, hasLocation]);

  // Safety: don't leave loading true forever
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoading(false), 8000);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    // Require a location before hitting Supabase.
    if (!hasLocation) {
      setListings([]);
      setLoadError(null);
      setHasLoaded(true);
      setLoading(false);
      return undefined;
    }
    if (!client) {
      setListings([]);
      setLoading(false);
      return undefined;
    }
    let active = true;
    const controller = new AbortController();

    async function getListingsSafe({ signal }) {
      try {
        let query = client
          .from("public_listings_v")
          .select("*")
          .order("created_at", { ascending: false });
        if (location.city) {
          query = query.ilike("city", location.city);
        }
        if (category) {
          const categoryId = await resolveCategoryIdByName(client, category);
          if (categoryId) {
            query = query.eq("category_id", categoryId);
          } else {
            query = query.ilike("category", category);
          }
        }
        if (searchTerm) {
          const escaped = searchTerm.replace(/,/g, "");
          query = query.or(
            `title.ilike.%${escaped}%,description.ilike.%${escaped}%`
          );
        }
        if (typeof query.abortSignal === "function") {
          query = query.abortSignal(signal);
        }
        const { data, error } = await query;
        if (error) {
          return { ok: false, error, status: error?.status };
        }
        return { ok: true, data: Array.isArray(data) ? data : [] };
      } catch (error) {
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
          const requestKey = `${category || "all"}::${searchTerm || "all"}`;
          const session = await client.auth.getSession().catch(() => null);
          const userState = session?.data?.session?.user?.id
            ? "signed_in"
            : "signed_out";
          const loggedKey = loggedErrorRef.current;
          if (loggedKey !== requestKey) {
            loggedErrorRef.current = requestKey;
            console.error("[LISTINGS][load:error]", {
              route: "/listings",
              userState,
              request: "supabase:listings",
              status: result.status,
              message: result.error?.message || "Unknown error",
            });
          }
          setLoadError({
            message:
              result.error?.message || "We couldn't load listings right now.",
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
      } catch (err) {
        console.error("Failed to load listings", err);
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
  }, [category, cacheKey, hasLoaded, retryKey, searchTerm, hasLocation, location.city]);

  return (
    <div className="max-w-6xl mx-auto py-2 md:pt-1">
      {showListView ? (
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-3 inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition"
        >
          ← Go back
        </button>
      ) : null}
      <div className="pt-4">
        <h1 className="text-3xl font-bold mb-2">
          {searchTerm
            ? `Search results for “${searchTerm}”`
            : "Explore listings"}
        </h1>
        {category ? (
          <p className="text-gray-600">
            Category: <span className="font-semibold">{category}</span>
          </p>
        ) : null}
      </div>

      {showLocationEmpty ? (
        <div className="mt-6 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-gray-600">
          Select a location to see listings near you.
        </div>
      ) : null}

      {loadError ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          <div className="font-semibold">Unable to load listings</div>
          <p className="text-sm mt-1">{loadError.message}</p>
          <button
            type="button"
            onClick={() => setRetryKey((prev) => prev + 1)}
            className="mt-3 inline-flex items-center rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700"
          >
            Try again
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6">Loading listings...</div>
      ) : null}

      {!loading && !loadError && !showLocationEmpty && sortedListings.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-gray-600">
          No listings found. Try a different search.
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sortedListings.map((listing) => {
          const inventory = normalizeInventory(listing);
          const availability = getAvailabilityBadgeStyle(inventory);
          return (
            <div
              key={listing.id}
              className="group flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <Link href={getListingUrl(listing)} className="block">
                <div className="relative w-full h-[200px] sm:h-[220px] lg:h-[240px] overflow-hidden bg-gray-50 p-2">
                  <SafeImage
                    src={primaryPhotoUrl(listing.photo_url)}
                    alt={listing.title || "Listing photo"}
                    className="h-full w-full object-contain transition duration-500 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 25vw"
                    onError={() => {}}
                    onLoad={() => {}}
                  />
                  {availability ? (
                    <span
                      className={`${availability.className} absolute left-3 top-3`}
                    >
                      {availability.label}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 p-4">
                  <div className="text-gray-900 tabular-nums leading-none">
                    {(() => {
                      const price = splitPrice(listing.price);
                      if (!price.dollars) {
                        return (
                          <span className="text-2xl font-bold leading-none">
                            {price.formatted}
                          </span>
                        );
                      }
                      return (
                        <span className="inline-flex items-start gap-0">
                          <span className="text-2xl font-bold leading-none">
                            ${price.dollars}
                          </span>
                          <span className="relative top-[0.1em] text-[0.65em] font-semibold uppercase leading-none align-top">
                            {price.cents}
                          </span>
                        </span>
                      );
                    })()}
                  </div>
                  <h2 className="text-sm font-semibold text-gray-900 line-clamp-3">
                    {listing.title || "Untitled listing"}
                  </h2>
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
