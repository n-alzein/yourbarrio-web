"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { primaryPhotoUrl } from "@/lib/listingPhotos";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { BookmarkCheck, Heart, Sparkles, Star } from "lucide-react";
import SafeImage from "@/components/SafeImage";
import { useTheme } from "@/components/ThemeProvider";
import {
  getAvailabilityBadgeStyle,
  normalizeInventory,
  sortListingsByAvailability,
} from "@/lib/inventory";
import { createFetchSafe } from "@/lib/fetchSafe";
import { memoizeRequest } from "@/lib/requestMemo";
import { getCustomerBusinessUrl, getListingUrl } from "@/lib/ids/publicRefs";
import { getListingCategoryLabel } from "@/lib/taxonomy/compat";
import { resolveBusinessImageSrc } from "@/lib/placeholders/businessPlaceholders";

const SAVED_BUSINESSES_EVENT = "yb:saved-businesses-changed";

const getShopId = (shop) => shop?.owner_user_id || shop?.id || null;

const formatShopLocation = (shop) => {
  const city = String(shop?.city || "").trim();
  const state = String(shop?.state || shop?.state_code || "").trim();
  if (city && state) return `${city}, ${state}`;
  return city || state || null;
};

const getShopHook = (shop) => {
  if (["auto_verified", "manually_verified"].includes(shop?.verification_status)) {
    return "✓ Verified · Trusted local shop";
  }
  return "Saved local shop";
};

export default function CustomerSavedClient({
  initialSaved,
  initialSavedShops = [],
  initialUserId,
  initialError,
  supportModeActive = false,
}) {
  const { user, supabase, loadingUser, authStatus } = useAuth();
  const { theme, hydrated } = useTheme();
  const isLight = hydrated ? theme === "light" : true;
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
        return;
      }
      dispatchSaved({ type: "LOAD_FROM_CACHE_EMPTY" });
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

  // Avoid getting stuck in loading if a request hangs
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
          .from("listings")
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
    // Wait for auth before refetching so we don't cache empty results.
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
      ? 0
      : saved.reduce((sum, item) => sum + Number(item.price || 0), 0) /
        totalSaved;
  const distinctCategories = Array.from(
    new Set(saved.map((item) => item.category).filter(Boolean))
  );

  useEffect(() => {
    if (activeTab === "listings" && totalSaved === 0 && totalSavedShops > 0) {
      setActiveTab("shops");
    }
  }, [activeTab, totalSaved, totalSavedShops]);

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
      <div className="min-h-screen bg-[var(--yb-bg)] text-[var(--yb-text)] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-12 w-12 rounded-full border-4 border-[var(--yb-border)] border-t-slate-500 animate-spin mx-auto" />
          <p className="text-lg text-[var(--yb-text-muted)]">Loading your account...</p>
        </div>
      </div>
    );
  }

  return (
    <section
      className="relative w-full min-h-screen text-white overflow-hidden pb-12 md:pb-16"
      style={{ paddingTop: "calc(var(--yb-nav-content-offset, 0px) + 16px)" }}
    >
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b0720] via-[#0a0816] to-black" />
        <div className="absolute -top-32 -left-20 h-[360px] w-[360px] rounded-full bg-purple-600/20 blur-[120px]" />
        <div className="absolute top-10 right-10 h-[300px] w-[300px] rounded-full bg-pink-500/15 blur-[120px]" />
      </div>

      <div className="w-full px-5 sm:px-6 md:px-8 lg:px-12">
        <div className="max-w-6xl mx-auto space-y-20">
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl overflow-hidden relative mb-12 md:mb-16">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 via-pink-500/15 to-transparent" />
          <div className="relative p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/70">
                <Sparkles className="h-4 w-4 text-pink-200" />
                Your saved collection
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">
                Keep favorites in one premium vault
              </h1>
              <p className="text-white/70 max-w-2xl">
                Curate the spots you love and jump back in instantly—no refreshing, no waiting.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-sm">
                  <Heart className="h-4 w-4 text-rose-200" />
                  {totalSavedAll} saved
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-sm">
                  <Star className="h-4 w-4 text-amber-200" />
                  {distinctCategories.length || "All"} categories
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-sm">
                  <BookmarkCheck className="h-4 w-4 text-emerald-200" />
                  Avg ${averagePrice ? averagePrice.toFixed(0) : "—"}
                </span>
              </div>
            </div>

            <div className="w-full md:w-auto">
              <Link
                href="/customer/home"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 px-5 py-3 text-sm font-semibold shadow-lg hover:scale-[1.02] transition"
              >
                Discover more
              </Link>
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            We could not load your saved picks. Please refresh or try again shortly.
          </div>
        ) : null}

        {!isAuthed && !loadingUser && (
          <div className="rounded-3xl border border-white/12 bg-white/5 backdrop-blur-xl shadow-2xl p-8 text-center space-y-4">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 border border-white/10 mx-auto">
              <Heart className="h-8 w-8 text-pink-200" />
            </div>
            <h2 className="text-2xl font-bold">Please sign in to view saved picks</h2>
            <p className="text-white/60 max-w-xl mx-auto">
              Log in to keep all your favorites in one place across devices.
            </p>
            <Link
              href="/customer-auth/login"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-lg font-semibold hover:brightness-110 transition shadow-lg"
            >
              Sign in
            </Link>
          </div>
        )}

        {isAuthed && (
          <div className="flex justify-center">
            <div className="inline-flex rounded-full border border-white/15 bg-white/10 p-1 backdrop-blur">
              {[
                { key: "listings", label: `Listings (${totalSaved})` },
                { key: "shops", label: `Shops (${totalSavedShops})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    activeTab === tab.key
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-white/75 hover:text-white"
                  }`}
                  aria-pressed={activeTab === tab.key}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {isAuthed && totalSavedAll === 0 && (
          <div className="rounded-3xl border border-white/12 bg-white/5 backdrop-blur-xl shadow-2xl p-8 text-center space-y-4">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 border border-white/10 mx-auto">
              <Heart className="h-8 w-8 text-pink-200" />
            </div>
            <h2 className="text-2xl font-bold">Nothing saved yet</h2>
            <p className="text-white/60 max-w-xl mx-auto">
              Items and businesses you save will appear here for quick access.
            </p>
            <Link
              href="/customer/nearby"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-lg font-semibold hover:brightness-110 transition shadow-lg"
            >
              Start exploring
            </Link>
          </div>
        )}

        {isAuthed && totalSavedAll > 0 && activeTab === "listings" && saved.length === 0 && (
          <div className="rounded-3xl border border-white/12 bg-white/5 backdrop-blur-xl shadow-2xl p-8 text-center space-y-4">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 border border-white/10 mx-auto">
              <Heart className="h-8 w-8 text-pink-200" />
            </div>
            <h2 className="text-2xl font-bold">No saved listings yet</h2>
            <p className="text-white/60 max-w-xl mx-auto">Items you save will appear here.</p>
            <Link
              href="/customer/home"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-lg font-semibold hover:brightness-110 transition shadow-lg"
            >
              Browse listings
            </Link>
          </div>
        )}

        {isAuthed && totalSavedAll > 0 && activeTab === "shops" && savedShops.length === 0 && (
          <div className="rounded-3xl border border-white/12 bg-white/5 backdrop-blur-xl shadow-2xl p-8 text-center space-y-4">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 border border-white/10 mx-auto">
              <Heart className="h-8 w-8 text-pink-200" />
            </div>
            <h2 className="text-2xl font-bold">No saved shops yet</h2>
            <p className="text-white/60 max-w-xl mx-auto">Businesses you save will appear here.</p>
            <Link
              href="/customer/nearby"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-lg font-semibold hover:brightness-110 transition shadow-lg"
            >
              Explore nearby businesses
            </Link>
          </div>
        )}

        {isAuthed && activeTab === "listings" && saved.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-white/60">Saved picks</p>
                <p className="text-lg font-semibold text-white">Handpicked just for you</p>
              </div>
              <div className="hidden md:flex items-center gap-2 text-sm text-white/70">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2">
                  <Sparkles className="h-4 w-4 text-pink-200" />
                  Freshly synced
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedSaved.map((item) => {
                const inventory = normalizeInventory(item);
                const badgeStyle = getAvailabilityBadgeStyle(
                  inventory.availability,
                  isLight
                );
                return (
                <Link
                  key={item.id}
                  href={getListingUrl(item)}
                  className="group relative rounded-2xl overflow-hidden border border-white/10 bg-white/5 backdrop-blur-xl shadow-xl hover:-translate-y-1 transition-transform duration-300"
                >
                  <div className="relative h-48 w-full overflow-hidden">
                    <SafeImage
                      src={primaryPhotoUrl(item.photo_url)}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition duration-500"
                      fallbackSrc="/business-placeholder.png"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                    <div className="theme-lock absolute top-3 left-3 text-xs px-3 py-1 rounded-full bg-black/50 border border-white/15 backdrop-blur flex items-center gap-1">
                      <Heart className="h-3.5 w-3.5 text-pink-200" />
                      <span className="text-white">Saved</span>
                    </div>
                    {item.price ? (
                      <div className="theme-lock absolute bottom-3 right-3 rounded-xl bg-black/60 border border-white/10 px-3 py-1 text-sm font-semibold">
                        <span className="text-white">${item.price}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h3 className="text-lg font-semibold leading-tight">
                          {item.title}
                        </h3>
                        <p className="text-xs uppercase tracking-wide text-white/60">
                          {getListingCategoryLabel(item, "Listing")}
                        </p>
                        <span
                          className="inline-flex items-center rounded-full border bg-transparent px-2 py-1 text-[10px] font-semibold"
                          style={
                            badgeStyle
                              ? { color: badgeStyle.color, borderColor: badgeStyle.border }
                              : undefined
                          }
                        >
                          {inventory.label}
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70">
                        <BookmarkCheck className="h-3.5 w-3.5" />
                        Quick open
                      </span>
                    </div>

                    <p className="text-white/70 text-sm line-clamp-2">
                      {item.description || "A local listing from YourBarrio."}
                    </p>

                    <div className="flex items-center justify-between text-sm text-white/70 pt-1">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        In your vault
                      </span>
                      <span className="text-white/60">View details →</span>
                    </div>
                  </div>
                </Link>
              );
              })}
            </div>
          </div>
        )}

        {isAuthed && activeTab === "shops" && savedShops.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-white/60">Saved shops</p>
                <p className="text-lg font-semibold text-white">Businesses you want to revisit</p>
              </div>
              <Link
                href="/customer/nearby"
                className="hidden rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 md:inline-flex"
              >
                Explore nearby businesses
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-4">
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
                const location = formatShopLocation(shop);
                return (
                  <article
                    key={businessId || shop.public_id || shop.business_name}
                    className="group relative overflow-hidden rounded-3xl border border-white/12 bg-white/8 p-3 shadow-2xl shadow-black/10 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/10"
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handleUnsaveShop(shop);
                      }}
                      disabled={savingShopIds.has(businessId)}
                      className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/30 text-rose-200 backdrop-blur transition hover:bg-black/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-wait disabled:opacity-70"
                      aria-label="Remove saved shop"
                      aria-pressed="true"
                    >
                      <Heart className="h-5 w-5" fill="currentColor" />
                    </button>
                    <Link href={href} className="grid gap-4 text-left sm:grid-cols-[160px_minmax(0,1fr)]">
                      <div className="relative h-40 overflow-hidden rounded-2xl bg-white/10 sm:h-36">
                        <SafeImage
                          src={imageSrc}
                          alt={shop.business_name || "Saved shop"}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          fallbackSrc={imageSrc}
                        />
                      </div>
                      <div className="flex min-w-0 flex-col justify-between gap-3 py-1 pr-12 sm:pr-4">
                        <div className="min-w-0">
                          <h3 className="line-clamp-2 text-xl font-semibold text-white">
                            {shop.business_name || "Local business"}
                          </h3>
                          <p className="mt-1 line-clamp-1 text-sm font-medium text-white/60">
                            {[shop.category || "Local shop", location].filter(Boolean).join(" · ")}
                          </p>
                          <p className="mt-2 line-clamp-1 text-sm font-semibold text-violet-100">
                            {getShopHook(shop)}
                          </p>
                        </div>
                        <span className="inline-flex w-fit min-h-9 items-center justify-center rounded-full bg-violet-500 px-4 text-sm font-semibold text-white shadow-sm transition group-hover:bg-violet-400">
                          View shop
                        </span>
                      </div>
                    </Link>
                  </article>
                );
              })}
            </div>
          </div>
        )}
        </div>
      </div>
    </section>
  );
}
