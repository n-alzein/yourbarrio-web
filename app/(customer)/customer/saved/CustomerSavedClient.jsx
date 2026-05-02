"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import SafeImage from "@/components/SafeImage";
import { useLocation } from "@/components/location/LocationProvider";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { createFetchSafe } from "@/lib/fetchSafe";
import { memoizeRequest } from "@/lib/requestMemo";
import { getCustomerBusinessUrl } from "@/lib/ids/publicRefs";
import { resolveBusinessImageSrc } from "@/lib/placeholders/businessPlaceholders";
import ListingMarketplaceCard from "@/app/(public)/listings/components/ListingMarketplaceCard";
import { sortListingsByAvailability } from "@/lib/inventory";

const SAVED_BUSINESSES_EVENT = "yb:saved-businesses-changed";

const getShopId = (shop) => shop?.owner_user_id || shop?.id || null;

const formatCurrency = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(number);
};

const formatShopLocation = (shop) => {
  const city = String(shop?.city || "").trim();
  const state = String(shop?.state || shop?.state_code || "").trim();
  if (city && state) return `${city}, ${state}`;
  return city || state || null;
};

const getSavedLocationName = (location, saved, savedShops) => {
  const locationCity = String(location?.city || "").trim();
  if (locationCity) return locationCity;

  const listingCity = saved.find((item) => String(item?.city || "").trim())?.city;
  if (listingCity) return String(listingCity).trim();

  const shopCity = savedShops.find((shop) => String(shop?.city || "").trim())?.city;
  if (shopCity) return String(shopCity).trim();

  return "your area";
};

const getShopMetaLine = (shop) => {
  const category = String(shop?.category || shop?.business_type || "Local shop").trim();
  const location = formatShopLocation(shop);
  return [category, location].filter(Boolean).join(" · ");
};

export default function CustomerSavedClient({
  initialSaved,
  initialSavedShops = [],
  initialUserId,
  initialError,
  supportModeActive = false,
}) {
  const { user, supabase, loadingUser, authStatus } = useAuth();
  const { location } = useLocation();
  const resolvedUserId =
    authStatus === "unauthenticated" ? null : user?.id || initialUserId || null;
  const authDiagEnabled = process.env.NEXT_PUBLIC_AUTH_DIAG === "1";
  const buildCacheKey = (id) => (id ? `yb_saved_${id}` : null);
  const buildShopCacheKey = (id) => (id ? `yb_saved_shop_rows_${id}` : null);
  const buildShopIdsCacheKey = (id) => (id ? `yb_saved_businesses_${id}` : null);
  const hasServerSaved = Array.isArray(initialSaved);
  const hasServerSavedShops = Array.isArray(initialSavedShops);
  const initialSavedState = {
    saved: hasServerSaved ? initialSaved : [],
    hasLoaded: hasServerSaved,
    error: initialError ?? null,
  };
  const [savedShops, setSavedShops] = useState(
    hasServerSavedShops ? initialSavedShops : []
  );
  const [activeTab, setActiveTab] = useState(() => {
    if (hasServerSaved && initialSaved?.length) return "listings";
    if (hasServerSavedShops && initialSavedShops?.length) return "shops";
    return "listings";
  });
  const [savingShopIds, setSavingShopIds] = useState(() => new Set());
  const [savingListingIds, setSavingListingIds] = useState(() => new Set());

  const initSavedState = (id) => {
    if (hasServerSaved) {
      return initialSavedState;
    }
    if (typeof window === "undefined" || !id) {
      return initialSavedState;
    }
    const cacheKey = buildCacheKey(id);
    if (!cacheKey) return initialSavedState;

    try {
      const raw = localStorage.getItem(cacheKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) {
        return {
          saved: parsed,
          hasLoaded: true,
          error: null,
        };
      }
      return initialSavedState;
    } catch (err) {
      return {
        saved: [],
        hasLoaded: true,
        error: err?.message || "cache-parse-failed",
      };
    }
  };

  const savedReducer = (state, action) => {
    switch (action.type) {
      case "RESET_FOR_USER":
        return {
          saved: action.saved,
          hasLoaded: action.hasLoaded,
          error: action.error ?? null,
        };
      case "LOAD_FROM_CACHE_SUCCESS":
        return {
          saved: action.saved,
          hasLoaded: true,
          error: null,
        };
      case "LOAD_FROM_CACHE_EMPTY":
        return {
          saved: [],
          hasLoaded: true,
          error: null,
        };
      case "LOAD_FROM_CACHE_ERROR":
        return {
          saved: [],
          hasLoaded: true,
          error: action.error ?? "cache-error",
        };
      default:
        return state;
    }
  };

  const [savedState, dispatchSaved] = useReducer(
    savedReducer,
    resolvedUserId,
    initSavedState
  );
  const { saved, hasLoaded, error } = savedState;
  const [loading, setLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(
    typeof document === "undefined" ? true : !document.hidden
  );
  const requestIdRef = useRef(0);
  const inflightRef = useRef(null);
  const cleanupRef = useRef(null);
  const sortedSaved = useMemo(() => sortListingsByAvailability(saved), [saved]);
  const lastCacheKeyRef = useRef(buildCacheKey(resolvedUserId));
  const isAuthed = Boolean(resolvedUserId);

  useEffect(() => {
    const nextCacheKey = buildCacheKey(resolvedUserId);
    const nextShopCacheKey = buildShopCacheKey(resolvedUserId);
    if (lastCacheKeyRef.current === nextCacheKey) return;
    lastCacheKeyRef.current = nextCacheKey;

    if (!nextCacheKey) {
      dispatchSaved({
        type: "RESET_FOR_USER",
        saved: [],
        hasLoaded: false,
        error: null,
      });
      setSavedShops([]);
      return;
    }

    if (hasServerSaved) {
      dispatchSaved({
        type: "LOAD_FROM_CACHE_SUCCESS",
        saved: initialSaved || [],
      });
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(nextCacheKey, JSON.stringify(initialSaved || []));
          if (nextShopCacheKey) {
            localStorage.setItem(nextShopCacheKey, JSON.stringify(initialSavedShops || []));
          }
          const shopIdsCacheKey = buildShopIdsCacheKey(resolvedUserId);
          if (shopIdsCacheKey) {
            localStorage.setItem(
              shopIdsCacheKey,
              JSON.stringify((initialSavedShops || []).map((shop) => getShopId(shop)).filter(Boolean))
            );
          }
        } catch {
          /* ignore */
        }
      }
      setSavedShops(initialSavedShops || []);
      return;
    }

    try {
      const raw = localStorage.getItem(nextCacheKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) {
        dispatchSaved({ type: "LOAD_FROM_CACHE_SUCCESS", saved: parsed });
      } else {
        dispatchSaved({ type: "LOAD_FROM_CACHE_EMPTY" });
      }
    } catch (err) {
      dispatchSaved({
        type: "LOAD_FROM_CACHE_ERROR",
        error: err?.message || "cache-parse-failed",
      });
    }

    try {
      const rawShops = nextShopCacheKey ? localStorage.getItem(nextShopCacheKey) : null;
      const parsedShops = rawShops ? JSON.parse(rawShops) : null;
      setSavedShops(Array.isArray(parsedShops) ? parsedShops : []);
    } catch {
      setSavedShops([]);
    }
  }, [resolvedUserId, hasServerSaved, initialSaved, initialSavedShops]);

  useEffect(() => {
    const handleVisibility = () => setIsVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoading(false), 8000);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const cacheKey = buildCacheKey(resolvedUserId);
    const shopCacheKey = buildShopCacheKey(resolvedUserId);
    const shopIdsCacheKey = buildShopIdsCacheKey(resolvedUserId);
    if (!cacheKey && !shopCacheKey && !shopIdsCacheKey) return;

    const handleStorage = (event) => {
      if (event.key === shopIdsCacheKey) {
        try {
          const ids = event.newValue ? JSON.parse(event.newValue) : [];
          if (Array.isArray(ids)) {
            setSavedShops((current) => current.filter((shop) => ids.includes(getShopId(shop))));
          }
        } catch {
          /* ignore */
        }
        return;
      }
      if (event.key === shopCacheKey) {
        try {
          const parsed = event.newValue ? JSON.parse(event.newValue) : [];
          setSavedShops(Array.isArray(parsed) ? parsed : []);
        } catch {
          setSavedShops([]);
        }
        return;
      }
      if (event.key !== cacheKey) return;
      if (!event.newValue) {
        dispatchSaved({ type: "LOAD_FROM_CACHE_EMPTY" });
        return;
      }

      try {
        const parsed = JSON.parse(event.newValue);
        if (Array.isArray(parsed)) {
          dispatchSaved({ type: "LOAD_FROM_CACHE_SUCCESS", saved: parsed });
          return;
        }
        dispatchSaved({ type: "LOAD_FROM_CACHE_EMPTY" });
      } catch (err) {
        dispatchSaved({
          type: "LOAD_FROM_CACHE_ERROR",
          error: err?.message || "cache-parse-failed",
        });
      }
    };

    const handleSavedBusinessesChanged = (event) => {
      const ids = event?.detail?.ids;
      if (!Array.isArray(ids)) return;
      setSavedShops((current) => current.filter((shop) => ids.includes(getShopId(shop))));
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(SAVED_BUSINESSES_EVENT, handleSavedBusinessesChanged);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(SAVED_BUSINESSES_EVENT, handleSavedBusinessesChanged);
    };
  }, [resolvedUserId]);

  const loadSaved = useCallback(() => {
    if (supportModeActive) {
      setLoading(false);
      return undefined;
    }
    const client = supabase ?? getSupabaseBrowserClient();

    if (!client || !resolvedUserId || typeof resolvedUserId !== "string") {
      setLoading(false);
      return undefined;
    }

    const requestId = ++requestIdRef.current;
    if (authDiagEnabled) {
      console.log("[AUTH_DIAG] saved:request:start", {
        requestId,
        userId: resolvedUserId,
        authStatus,
        pathname: typeof window !== "undefined" ? window.location.pathname : null,
      });
    }
    inflightRef.current?.abort?.();
    setLoading((prev) => (hasLoaded ? prev : true));
    const safeRequest = createFetchSafe(
      async ({ signal }) => {
        const { data: sessionData, error: sessionError } =
          await client.auth.getSession();
        if (authDiagEnabled) {
          console.log("[AUTH_DIAG] saved:session", {
            requestId,
            sessionUserId: sessionData?.session?.user?.id ?? null,
            error: sessionError
              ? {
                  status: sessionError.status,
                  message: sessionError.message,
                }
              : null,
          });
        }
        if (sessionError) {
          if (authStatus !== "authenticated") return [];
          throw sessionError;
        }
        if (!sessionData?.session?.user?.id) {
          if (authStatus !== "authenticated") return [];
          throw new Error("missing_session");
        }
        if (authDiagEnabled) {
          console.log("[AUTH_DIAG] saved:query", {
            requestId,
            table: "saved_listings",
            filters: { user_id: resolvedUserId },
          });
        }
        let savedQuery = client
          .from("saved_listings")
          .select("listing_id")
          .eq("user_id", resolvedUserId);
        if (typeof savedQuery.abortSignal === "function") {
          savedQuery = savedQuery.abortSignal(signal);
        }
        const { data: savedRows, error: savedError } = await savedQuery;
        if (authDiagEnabled) {
          console.log("[AUTH_DIAG] saved:query:result", {
            requestId,
            table: "saved_listings",
            count: Array.isArray(savedRows) ? savedRows.length : 0,
            error: savedError
              ? {
                  status: savedError.status,
                  message: savedError.message,
                  details: savedError.details,
                  hint: savedError.hint,
                }
              : null,
          });
        }
        if (savedError) throw savedError;

        const ids = (savedRows || [])
          .map((row) => row.listing_id)
          .filter(Boolean);

        if (ids.length === 0) {
          const { data: savedShopRows, error: savedShopError } = await client
            .from("saved_businesses")
            .select("business_id")
            .eq("user_id", resolvedUserId);
          if (savedShopError) throw savedShopError;
          const shopIds = (savedShopRows || []).map((row) => row.business_id).filter(Boolean);
          if (!shopIds.length) return { listings: [], shops: [] };
          const { data: shops, error: shopsError } = await client
            .from("businesses")
            .select("id,owner_user_id,public_id,business_name,business_type,category,city,state,address,description,website,profile_photo_url,cover_photo_url,verification_status,created_at,updated_at")
            .in("owner_user_id", shopIds);
          if (shopsError) throw shopsError;
          return { listings: [], shops: Array.isArray(shops) ? shops : [] };
        }

        if (authDiagEnabled) {
          console.log("[AUTH_DIAG] saved:query", {
            requestId,
            table: "listings",
            filters: { id: ids },
          });
        }
        let listingQuery = client
          .from("public_listings_v")
          .select("*")
          .in("id", ids);
        if (typeof listingQuery.abortSignal === "function") {
          listingQuery = listingQuery.abortSignal(signal);
        }
        const { data: listings, error: listError } = await listingQuery;
        if (authDiagEnabled) {
          console.log("[AUTH_DIAG] saved:query:result", {
            requestId,
            table: "listings",
            count: Array.isArray(listings) ? listings.length : 0,
            error: listError
              ? {
                  status: listError.status,
                  message: listError.message,
                  details: listError.details,
                  hint: listError.hint,
                }
              : null,
          });
        }
        if (listError) throw listError;
        const { data: savedShopRows, error: savedShopError } = await client
          .from("saved_businesses")
          .select("business_id")
          .eq("user_id", resolvedUserId);
        if (savedShopError) throw savedShopError;
        const shopIds = (savedShopRows || []).map((row) => row.business_id).filter(Boolean);
        let shops = [];
        if (shopIds.length) {
          const { data: shopRows, error: shopsError } = await client
            .from("businesses")
            .select("id,owner_user_id,public_id,business_name,business_type,category,city,state,address,description,website,profile_photo_url,cover_photo_url,verification_status,created_at,updated_at")
            .in("owner_user_id", shopIds);
          if (shopsError) throw shopsError;
          shops = Array.isArray(shopRows) ? shopRows : [];
        }
        return {
          listings: Array.isArray(listings) ? listings : [],
          shops,
        };
      },
      { label: "customer-saved" }
    );
    inflightRef.current = safeRequest;

    memoizeRequest(`customer-saved:${resolvedUserId}`, safeRequest.run)
      .then((result) => {
        if (!result || result.aborted) return;
        if (requestId !== requestIdRef.current) return;
        if (!result.ok) throw result.error;
        const normalized = Array.isArray(result.result)
          ? result.result
          : result.result?.listings || [];
        const normalizedShops = Array.isArray(result.result?.shops)
          ? result.result.shops
          : [];
        dispatchSaved({ type: "LOAD_FROM_CACHE_SUCCESS", saved: normalized });
        setSavedShops(normalizedShops);
        if (typeof window !== "undefined") {
          try {
            const cacheKey = buildCacheKey(resolvedUserId);
            if (cacheKey) {
              localStorage.setItem(cacheKey, JSON.stringify(normalized));
            }
            const shopCacheKey = buildShopCacheKey(resolvedUserId);
            if (shopCacheKey) {
              localStorage.setItem(shopCacheKey, JSON.stringify(normalizedShops));
            }
            const shopIdsCacheKey = buildShopIdsCacheKey(resolvedUserId);
            const shopIds = normalizedShops.map((shop) => getShopId(shop)).filter(Boolean);
            if (shopIdsCacheKey) {
              localStorage.setItem(shopIdsCacheKey, JSON.stringify(shopIds));
              window.dispatchEvent(
                new CustomEvent(SAVED_BUSINESSES_EVENT, {
                  detail: { ids: shopIds },
                })
              );
            }
          } catch {
            /* ignore */
          }
        }
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return;
        if (err?.name === "AbortError" || String(err?.message || "").includes("AbortError")) {
          return;
        }
        console.error("Saved listings load failed", err);
        dispatchSaved({
          type: "LOAD_FROM_CACHE_ERROR",
          error: err?.message || "saved_load_failed",
        });
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });

    return () => {
      inflightRef.current?.abort?.();
    };
  }, [authDiagEnabled, authStatus, supabase, resolvedUserId, hasLoaded, supportModeActive]);

  useEffect(() => {
    if (supportModeActive) return;
    if (!isVisible && hasLoaded) return;
    if (!resolvedUserId) return;

    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const cleanup = loadSaved();
      cleanupRef.current = typeof cleanup === "function" ? cleanup : null;
    });
    return () => {
      active = false;
      if (cleanupRef.current) cleanupRef.current();
      cleanupRef.current = null;
    };
  }, [loadSaved, isVisible, hasLoaded, resolvedUserId, supportModeActive]);

  const totalSaved = saved.length;
  const totalSavedShops = savedShops.length;
  const totalSavedAll = totalSaved + totalSavedShops;
  const averagePrice =
    totalSaved === 0
      ? null
      : saved.reduce((sum, item) => sum + Number(item.price || 0), 0) / totalSaved;
  const locationName = useMemo(
    () => getSavedLocationName(location, saved, savedShops),
    [location, saved, savedShops]
  );
  const statsSummary = [
    `${totalSavedAll} saved`,
    `${totalSavedShops} shop${totalSavedShops === 1 ? "" : "s"}`,
    `Avg ${formatCurrency(averagePrice) || "—"}`,
  ].join(" • ");

  useEffect(() => {
    if (activeTab === "listings" && totalSaved === 0 && totalSavedShops > 0) {
      setActiveTab("shops");
    }
  }, [activeTab, totalSaved, totalSavedShops]);

  const persistSavedListings = useCallback(
    (nextSaved) => {
      if (typeof window === "undefined") return;
      const cacheKey = buildCacheKey(resolvedUserId);
      if (!cacheKey) return;
      try {
        localStorage.setItem(cacheKey, JSON.stringify(nextSaved));
      } catch {
        /* ignore */
      }
    },
    [resolvedUserId]
  );

  const handleToggleSavedListing = useCallback(
    async (listing) => {
      const listingId = String(listing?.id || "").trim();
      if (!listingId || !resolvedUserId) return;

      setSavingListingIds((prev) => new Set(prev).add(listingId));
      const previous = saved;
      const next = saved.filter((item) => String(item?.id || "") !== listingId);
      dispatchSaved({ type: "LOAD_FROM_CACHE_SUCCESS", saved: next });

      try {
        const response = await fetch("/api/customer/saved-listings", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ listingId }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error || "Failed to unsave listing");
        }
        persistSavedListings(next);
      } catch (err) {
        console.error("Unsave listing failed", err);
        dispatchSaved({ type: "LOAD_FROM_CACHE_SUCCESS", saved: previous });
      } finally {
        setSavingListingIds((prev) => {
          const updated = new Set(prev);
          updated.delete(listingId);
          return updated;
        });
      }
    },
    [persistSavedListings, resolvedUserId, saved]
  );

  const handleUnsaveShop = useCallback(
    async (shop) => {
      const businessId = getShopId(shop);
      if (!businessId || !resolvedUserId) return;
      setSavingShopIds((prev) => new Set(prev).add(businessId));
      const previous = savedShops;
      const next = savedShops.filter((item) => getShopId(item) !== businessId);
      setSavedShops(next);
      try {
        const response = await fetch("/api/customer/saved-businesses", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ businessId }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error || "Failed to unsave shop");
        }
        if (typeof window !== "undefined") {
          const shopCacheKey = buildShopCacheKey(resolvedUserId);
          const shopIdsCacheKey = buildShopIdsCacheKey(resolvedUserId);
          const ids = next.map((item) => getShopId(item)).filter(Boolean);
          try {
            if (shopCacheKey) localStorage.setItem(shopCacheKey, JSON.stringify(next));
            if (shopIdsCacheKey) localStorage.setItem(shopIdsCacheKey, JSON.stringify(ids));
          } catch {
            /* ignore */
          }
          window.dispatchEvent(
            new CustomEvent(SAVED_BUSINESSES_EVENT, {
              detail: { ids },
            })
          );
        }
      } catch (err) {
        console.error("Unsave shop failed", err);
        setSavedShops(previous);
      } finally {
        setSavingShopIds((prev) => {
          const updated = new Set(prev);
          updated.delete(businessId);
          return updated;
        });
      }
    },
    [resolvedUserId, savedShops]
  );

  if (loadingUser && !user && !initialUserId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafafc] px-6 text-slate-900">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-500" />
          <p className="text-sm text-slate-500">Loading your saved items...</p>
        </div>
      </div>
    );
  }

  return (
    <section
      className="min-h-screen bg-[#fafafc] pb-12 text-slate-950 md:pb-16"
    >
      <div className="mx-auto w-full max-w-5xl px-4 md:px-6">
        <div className="space-y-8">
          <header className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Saved
            </h1>
            <p className="text-sm text-slate-500">Your favorites in {locationName}</p>
            {isAuthed ? (
              <div className="pt-1">
                <div className="flex items-end gap-6">
                  {[
                    { key: "listings", label: `Listings (${totalSaved})` },
                    { key: "shops", label: `Shops (${totalSavedShops})` },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={`border-b-2 px-0 pb-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 ${
                        activeTab === tab.key
                          ? "border-violet-600 text-violet-600"
                          : "border-transparent text-slate-500 hover:text-slate-900"
                      }`}
                      aria-pressed={activeTab === tab.key}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <p className="pt-2 text-xs text-slate-400">{statsSummary}</p>
                <div className="mt-4 border-b border-slate-200" />
              </div>
            ) : (
              <div className="mt-4 border-b border-slate-200" />
            )}
          </header>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-600">
              We could not load your saved items. Please refresh and try again.
            </div>
          ) : null}

          {!isAuthed && !loadingUser ? (
            <div className="rounded-3xl border border-slate-200 bg-white px-6 py-10 text-center shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
              <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                <Heart className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                Please sign in to view saved items
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
                Log in to keep your favorites synced across devices.
              </p>
              <Link
                href="/customer-auth/login"
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-600 px-5 text-sm font-semibold text-white transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
              >
                Sign in
              </Link>
            </div>
          ) : null}

          {isAuthed && totalSavedAll === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white px-6 py-14 text-center shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
              <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                <Heart className="h-7 w-7" />
              </div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                Nothing saved yet
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
                Start exploring local shops and save what you love.
              </p>
              <Link
                href="/customer/home"
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-600 px-5 text-sm font-semibold text-white transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
              >
                Browse listings
              </Link>
            </div>
          ) : null}

          {isAuthed && totalSavedAll > 0 && activeTab === "listings" && saved.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
              No saved listings yet.
            </div>
          ) : null}

          {isAuthed && totalSavedAll > 0 && activeTab === "shops" && savedShops.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
              No saved shops yet.
            </div>
          ) : null}

          {isAuthed && activeTab === "listings" && saved.length > 0 ? (
            <section className="mt-8 space-y-4 md:mt-10">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                    Saved listings
                  </h2>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {sortedSaved.map((item, index) => {
                  const listingId = String(item?.id || "");
                  return (
                    <ListingMarketplaceCard
                      key={item.public_id || item.id || `${item.title}-${index}`}
                      listing={item}
                      fallbackLocationLabel={locationName}
                      variant="saved"
                      isSaved
                      saveLoading={savingListingIds.has(listingId)}
                      onToggleSave={handleToggleSavedListing}
                    />
                  );
                })}
              </div>
            </section>
          ) : null}

          {isAuthed && activeTab === "shops" && savedShops.length > 0 ? (
            <section className="mt-8 space-y-4 md:mt-10">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                    Saved shops
                  </h2>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {savedShops.map((shop) => {
                  const businessId = getShopId(shop);
                  const imageSrc = resolveBusinessImageSrc({
                    imageUrl: shop.cover_photo_url || shop.profile_photo_url || null,
                    businessType: shop.business_type,
                    legacyCategory: shop.category,
                  });
                  const normalizedShop = {
                    ...shop,
                    id: businessId,
                    public_id: shop.public_id || null,
                  };
                  const href = getCustomerBusinessUrl(normalizedShop);

                  return (
                    <article
                      key={businessId || shop.public_id || shop.business_name}
                      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                    >
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => handleUnsaveShop(shop)}
                          disabled={savingShopIds.has(businessId)}
                          className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/90 text-slate-600 shadow-sm backdrop-blur-sm transition hover:border-rose-200 hover:text-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 disabled:cursor-wait disabled:opacity-70"
                          aria-label="Remove saved shop"
                          aria-pressed="true"
                          title="Remove saved shop"
                        >
                          <Heart className="h-5 w-5 text-rose-500" fill="currentColor" />
                        </button>

                        <Link
                          href={href}
                          className="relative block aspect-[16/10] overflow-hidden bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
                        >
                          <SafeImage
                            src={imageSrc}
                            alt={shop.business_name || "Saved shop"}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                            fallbackSrc={imageSrc}
                          />
                        </Link>
                      </div>

                      <div className="space-y-4 p-4">
                        <div className="min-w-0 space-y-1">
                          <Link
                            href={href}
                            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
                          >
                            <h3 className="line-clamp-2 text-lg font-semibold tracking-[-0.02em] text-slate-950">
                              {shop.business_name || "Local business"}
                            </h3>
                          </Link>
                          <p className="line-clamp-1 text-sm text-slate-500">
                            {getShopMetaLine(shop)}
                          </p>
                        </div>

                        <div className="flex items-center justify-end pt-1">
                          <Link
                            href={href}
                            className="inline-flex items-center justify-center rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-sm font-medium text-violet-600 transition hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
                          >
                            View shop
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}
