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
import { getListingUrl } from "@/lib/ids/publicRefs";

export default function CustomerSavedClient({
  initialSaved,
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
  const hasServerSaved = Array.isArray(initialSaved);
  const initialSavedState = {
    saved: hasServerSaved ? initialSaved : [],
    hasLoaded: hasServerSaved,
    error: initialError ?? null,
  };

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
    if (lastCacheKeyRef.current === nextCacheKey) return;
    lastCacheKeyRef.current = nextCacheKey;

    if (!nextCacheKey) {
      dispatchSaved({
        type: "RESET_FOR_USER",
        saved: [],
        hasLoaded: false,
        error: null,
      });
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
        } catch {
          /* ignore */
        }
      }
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
  }, [resolvedUserId, hasServerSaved, initialSaved]);

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
    if (!cacheKey) return;

    const handleStorage = (event) => {
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

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
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
          return [];
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
          .select("*, category_info:business_categories(name,slug)")
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
        return Array.isArray(listings) ? listings : [];
      },
      { label: "customer-saved" }
    );
    inflightRef.current = safeRequest;

    memoizeRequest(`customer-saved:${resolvedUserId}`, safeRequest.run)
      .then((result) => {
        if (!result || result.aborted) return;
        if (requestId !== requestIdRef.current) return;
        if (!result.ok) throw result.error;
        const normalized = (result.result || []).map((row) => ({
          ...row,
          category: row.category_info?.name || row.category,
        }));
        dispatchSaved({ type: "LOAD_FROM_CACHE_SUCCESS", saved: normalized });
        if (typeof window !== "undefined") {
          try {
            const cacheKey = buildCacheKey(resolvedUserId);
            if (cacheKey) {
              localStorage.setItem(cacheKey, JSON.stringify(normalized));
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
  const averagePrice =
    totalSaved === 0
      ? 0
      : saved.reduce((sum, item) => sum + Number(item.price || 0), 0) /
        totalSaved;
  const distinctCategories = Array.from(
    new Set(saved.map((item) => item.category).filter(Boolean))
  );

  if (loadingUser && !user && !initialUserId) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-12 w-12 rounded-full border-4 border-white/10 border-t-white/70 animate-spin mx-auto" />
          <p className="text-lg text-white/70">Loading your account...</p>
        </div>
      </div>
    );
  }

  return (
    <section className="relative w-full min-h-screen pt-2 md:pt-3 text-white overflow-hidden -mt-8 md:-mt-12 pb-12 md:pb-16">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b0720] via-[#0a0816] to-black" />
        <div className="absolute -top-32 -left-20 h-[360px] w-[360px] rounded-full bg-purple-600/20 blur-[120px]" />
        <div className="absolute top-10 right-10 h-[300px] w-[300px] rounded-full bg-pink-500/15 blur-[120px]" />
      </div>

      <div className="w-full px-5 sm:px-6 md:px-8 lg:px-12">
        <div className="max-w-6xl mx-auto space-y-20">
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl overflow-hidden relative mt-6 md:mt-8 mb-12 md:mb-16">
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
                  {totalSaved} saved
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

        {isAuthed && saved.length === 0 && (
          <div className="rounded-3xl border border-white/12 bg-white/5 backdrop-blur-xl shadow-2xl p-8 text-center space-y-4">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 border border-white/10 mx-auto">
              <Heart className="h-8 w-8 text-pink-200" />
            </div>
            <h2 className="text-2xl font-bold">Nothing saved yet</h2>
            <p className="text-white/60 max-w-xl mx-auto">
              Browse neighborhood favorites and tap the heart to save them here for quick access.
            </p>
            <Link
              href="/customer/home"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-lg font-semibold hover:brightness-110 transition shadow-lg"
            >
              Start exploring
            </Link>
          </div>
        )}

        {isAuthed && saved.length > 0 && (
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
                          {item.category || "Listing"}
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
        </div>
      </div>
    </section>
  );
}
