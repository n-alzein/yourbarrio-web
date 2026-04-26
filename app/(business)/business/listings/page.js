"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { resolveListingCoverImageUrl } from "@/lib/listingPhotos";
import { normalizeInventory } from "@/lib/inventory";
import { useTheme } from "@/components/ThemeProvider";
import SafeImage from "@/components/SafeImage";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { getListingPublicRef } from "@/lib/ids/publicRefs";
import { getListingCategoryLabel } from "@/lib/taxonomy/compat";
import { getListingCategoryPlaceholder } from "@/lib/taxonomy/placeholders";
import { calculateListingPricing } from "@/lib/pricing";

function formatCurrency(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(normalized);
}

function formatPriceCents(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(normalized / 100);
}

export default function BusinessListingsPage() {
  const { supabase, user, loadingUser } = useAuth();
  const router = useRouter();
  const { theme, hydrated } = useTheme();
  const isLight = hydrated ? theme === "light" : true;
  const [isHydrating, setIsHydrating] = useState(true);

  const [listings, setListings] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const cached = sessionStorage.getItem("yb_business_listings");
      const parsed = cached ? JSON.parse(cached) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(() => listings.length > 0);
  const [isVisible, setIsVisible] = useState(
    typeof document === "undefined" ? true : !document.hidden
  );
  const totalListings = listings.length;
  const averagePrice =
    totalListings === 0
      ? 0
      : listings.reduce((sum, item) => sum + Number(item.price || 0), 0) /
        totalListings;
  const primaryCategory = getListingCategoryLabel(
    listings.find((item) => getListingCategoryLabel(item, "")),
    "Category pending"
  );
  const lastUpdated = listings[0]?.created_at
    ? new Date(listings[0].created_at).toLocaleDateString()
    : "—";
  const showLoading = !hasLoaded && ((loadingUser && !user) || loading);

  useEffect(() => {
    const handleVisibility = () => setIsVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    setIsHydrating(false);
  }, []);

  // Safety: don't leave loading true forever
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoading(false), 8000);
    return () => clearTimeout(timer);
  }, [loading]);

  // ------------------------------------------------------
  //  SAFE AUTH GUARD + FETCH
  // ------------------------------------------------------
  useEffect(() => {
    if (loadingUser && !user) return; // Wait for auth only if we don't have a user
    if (!user) {
      setLoading(false);
      return;
    }
    if (!isVisible) return;

    async function fetchListings() {
      // Only show the loading state if we don't already have data
      setLoading((prev) => (hasLoaded ? prev : true));
      let active = true;
      try {
        const response = await fetchWithTimeout("/api/business/listings", {
          method: "GET",
          credentials: "include",
          timeoutMs: 12000,
        });

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Failed to load listings");
        }

        const payload = await response.json();
        const data = Array.isArray(payload?.listings) ? payload.listings : [];
        if (!active) return;
        setListings(data);
        setHasLoaded(true);
        try {
          sessionStorage.setItem("yb_business_listings", JSON.stringify(data));
        } catch {
          // ignore cache write errors
        }
      } catch (err) {
        console.error("❌ Fetch listings error:", err);
      } finally {
        if (active) setLoading(false);
      }

      return () => {
        active = false;
      };
    }

    const cleanup = fetchListings();
    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  }, [loadingUser, user, supabase, hasLoaded, isVisible]);

  // ------------------------------------------------------
  // DELETE LISTING
  // ------------------------------------------------------
  async function handleDelete(id) {
    if (!confirm("Are you sure you want to delete this listing?")) return;

    const client = getSupabaseBrowserClient() ?? supabase;
    if (!client) {
      alert("Connection not ready. Please try again.");
      return;
    }
    const { error } = await client
      .from("listings")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("❌ Delete error:", error);
      alert("Failed to delete listing.");
      return;
    }

    setListings((prev) => prev.filter((l) => l.id !== id));
  }

  async function handleStatusChange(id, nextStatus) {
    const client = getSupabaseBrowserClient() ?? supabase;
    if (!client) {
      alert("Connection not ready. Please try again.");
      return;
    }

    const { error } = await client
      .from("listings")
      .update({ status: nextStatus })
      .eq("id", id);

    if (error) {
      console.error("❌ Status update error:", error);
      alert(`Failed to ${nextStatus === "published" ? "publish" : "unpublish"} listing.`);
      return;
    }

    setListings((prev) =>
      prev.map((listing) =>
        listing.id === id
          ? {
              ...listing,
              status: nextStatus,
            }
          : listing
      )
    );
  }

  // ------------------------------------------------------
  // LOADING STATES
  // ------------------------------------------------------
  if (isHydrating) {
    return (
      <p className="text-slate-700 dark:text-slate-100 text-center py-20">
        Loading listings...
      </p>
    );
  }
  if (showLoading) {
    return (
      <p className="text-slate-700 dark:text-slate-100 text-center py-20">
        Loading listings...
      </p>
    );
  }
  if (!user) {
    return (
      <p className="text-slate-700 dark:text-slate-100 text-center py-20">
        Loading your account...
      </p>
    );
  }

  // ------------------------------------------------------
  // RENDER
  // ------------------------------------------------------
  return (
    <div className="max-w-6xl mx-auto px-6 py-4 md:py-8 text-slate-900 dark:text-slate-100">
      {/* Snapshot banner */}
      <div
        className={`rounded-2xl border shadow-sm p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 ${
          isLight
            ? "bg-white border-slate-200/80"
            : "bg-slate-900/70 border-white/10"
        }`}
      >
        <div className="flex-1">
          <div
            className={`text-xs font-semibold uppercase tracking-wide ${
              isLight ? "text-slate-600" : "text-slate-300"
            }`}
          >
            Snapshot
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <div className={`text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                Total listings
              </div>
              <div className={`text-lg font-semibold ${isLight ? "text-slate-900" : "text-slate-100"}`}>
                {totalListings}
              </div>
            </div>
            <div className="space-y-1">
              <div className={`text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                Avg. price
              </div>
              <div className={`text-lg font-semibold ${isLight ? "text-slate-900" : "text-slate-100"}`}>
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 0,
                }).format(averagePrice || 0)}
              </div>
            </div>
            <div className="space-y-1">
              <div className={`text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                Lead category
              </div>
              <div className={`text-sm font-semibold ${isLight ? "text-slate-900" : "text-slate-100"}`}>
                {primaryCategory}
              </div>
            </div>
            <div className="space-y-1">
              <div className={`text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                Last update
              </div>
              <div className={`text-sm font-semibold ${isLight ? "text-slate-900" : "text-slate-100"}`}>
                {lastUpdated}
              </div>
            </div>
          </div>
        </div>
        <div className="theme-lock">
          <button
            onClick={() => router.push("/business/listings/new")}
            className="yb-primary-button inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
          >
            + Create new listing
          </button>
        </div>
      </div>

      {/* Empty state */}
      {listings.length === 0 && (
        <div
          className={`mt-12 rounded-3xl border border-dashed p-10 text-center shadow-sm ${
            isLight ? "bg-white border-slate-300/80" : "bg-slate-900/60 border-white/15"
          }`}
        >
          <h2 className="text-2xl font-bold">No listings yet</h2>
          <p className="mt-2 text-slate-600 dark:text-slate-300">
            Add your first item to start reaching nearby customers.
          </p>
          <div className="mt-6">
            <button
              onClick={() => router.push("/business/listings/new")}
              className="yb-primary-button inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold text-white"
            >
              Add your first listing
            </button>
          </div>
        </div>
      )}

      {/* List grid */}
      {listings.length > 0 && (
        <div className="mt-12 space-y-12">
          <div className="flex items-start justify-between">
            <div>
              <h2 className={`text-xl font-bold ${isLight ? "text-slate-900" : "text-slate-100"}`}>
                Catalog
              </h2>
              <p className={`text-sm ${isLight ? "text-slate-700" : "text-slate-400"} mb-8`}>
                Manage imagery, categories, and pricing in one place.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings.map((listing) => {
              const inventory = normalizeInventory(listing);
              const isDraft = String(listing.status || "").trim().toLowerCase() === "draft";
              const hasUnpublishedChanges = listing.has_unpublished_changes === true;
              const isOutOfStock =
                inventory.availability === "out" || Number(listing.inventory_quantity) === 0;
              const pricing = calculateListingPricing(listing.price);
              const sellerPriceLabel = formatCurrency(listing.price);
              const customerFacingPriceLabel =
                pricing.finalPriceCents > pricing.basePriceCents
                  ? formatPriceCents(listing.finalPriceCents ?? pricing.finalPriceCents)
                  : null;
              const editHref = `/business/listings/${encodeURIComponent(
                getListingPublicRef(listing) || listing.id
              )}/edit`;

              return (
                <div
                  key={listing.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(editHref)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(editHref);
                    }
                  }}
                  className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border transition-all duration-200 ${
                    isLight
                      ? "bg-white border-slate-200 hover:border-slate-300 hover:shadow-lg"
                      : "bg-slate-900 border-slate-700 hover:border-slate-600 hover:shadow-xl"
                  }`}
                >
                  {/* Image Section */}
                  {resolveListingCoverImageUrl(listing) ? (
                    <div
                      className={`relative h-56 w-full overflow-hidden ${
                        isLight ? "bg-white" : "bg-slate-800"
                      }`}
                    >
                      <SafeImage
                        src={resolveListingCoverImageUrl(listing)}
                        alt={listing.title}
                        className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                        style={{ objectFit: "contain", objectPosition: "center" }}
                        fallbackSrc={getListingCategoryPlaceholder(listing)}
                      />
                      {isOutOfStock ? (
                        <div className="absolute inset-0 bg-slate-950/10" aria-hidden="true" />
                      ) : null}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center bg-gradient-to-t from-slate-950/22 via-slate-950/0 to-transparent p-4 opacity-0 transition-opacity duration-200 sm:group-hover:opacity-100">
                        <span className="rounded-md bg-white/92 px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm">
                          Edit listing
                        </span>
                      </div>
                      <div className="absolute top-2 right-2">
                        <span
                          className="inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur-sm"
                          style={
                            isOutOfStock
                              ? {
                                  backgroundColor: "#ffffff",
                                  color: "#111827",
                                  border: "1px solid #e5e7eb",
                                  boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                                }
                              : isDraft
                              ? {
                                  backgroundColor: "#fff7ed",
                                  color: "#c2410c",
                                  border: "1px solid #fdba74",
                                }
                              : hasUnpublishedChanges
                              ? {
                                  backgroundColor: "#f5f3ff",
                                  color: "#6d28d9",
                                  border: "1px solid #ddd6fe",
                                }
                              : {
                                  backgroundColor: "#f0fdf4",
                                  color: "#166534",
                                  border: "1px solid #bbf7d0",
                                }
                          }
                        >
                          {isOutOfStock
                            ? "Out of stock"
                            : isDraft
                              ? "Draft"
                              : hasUnpublishedChanges
                                ? "Changes not published"
                                : "Live"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className={`h-56 w-full flex items-center justify-center ${
                      isLight ? "bg-white" : "bg-slate-800"
                    }`}>
                      <span className={isLight ? "text-slate-600" : "text-slate-500"}>No image</span>
                    </div>
                  )}

                  {/* Content Section */}
                  <div className="flex flex-col flex-1 p-4">
                    {/* Category */}
                    <p
                      className={`mb-1 text-[11px] font-medium uppercase tracking-[0.08em] ${
                        isLight ? "text-slate-600" : "text-slate-400"
                      }`}
                    >
                      {getListingCategoryLabel(listing, "Uncategorized")}
                    </p>

                    {/* Title */}
                    <h3
                      className={`mb-2 min-h-[3rem] text-base font-semibold line-clamp-2 ${
                        isLight ? "text-slate-900" : "text-slate-100"
                      }`}
                    >
                      {listing.title || "Untitled listing"}
                    </h3>

                    {/* Price */}
                    <div className="mb-2 space-y-1.5">
                      <p
                        className={`text-[11px] font-medium uppercase tracking-[0.08em] ${
                          isLight ? "text-slate-500" : "text-slate-400"
                        }`}
                      >
                        Seller price
                      </p>
                      <span
                        className={`text-2xl font-bold ${
                          isLight ? "text-slate-900" : "text-slate-100"
                        }`}
                      >
                        {sellerPriceLabel ?? "Price TBD"}
                      </span>
                      {customerFacingPriceLabel ? (
                        <p className={`text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                          Customer-facing price: {customerFacingPriceLabel} incl. marketplace fee
                        </p>
                      ) : null}
                    </div>

                    {/* Stock Info */}
                    <div className={`mb-4 text-sm ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                      {isOutOfStock ? (
                        <span className="font-semibold">Out of stock</span>
                      ) : (
                        <>
                          <span className="font-semibold">
                            {listing.inventory_quantity ?? "—"}
                          </span>{" "}
                          in stock
                        </>
                      )}
                    </div>

                    {/* Spacer to push buttons to bottom */}
                    <div className="flex-1"></div>

                    {/* Action Buttons */}
                    <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                      <div className="flex flex-wrap items-center gap-2">
                        {isDraft ? (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              handleStatusChange(listing.id, "published");
                            }}
                            className="yb-primary-button rounded-md px-3 py-2 text-sm font-semibold text-white"
                          >
                            Publish
                          </button>
                        ) : null}
                        {!isDraft ? (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              handleStatusChange(listing.id, "draft");
                            }}
                            className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                              isLight
                                ? "border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                                : "border-slate-600 text-slate-200 hover:border-slate-500 hover:bg-slate-800"
                            }`}
                          >
                            Unpublish
                          </button>
                        ) : null}
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDelete(listing.id);
                          }}
                          className={`px-1 py-2 text-sm font-medium transition-colors ${
                            isLight
                              ? "text-slate-500 hover:text-slate-900"
                              : "text-slate-400 hover:text-slate-100"
                          }`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
