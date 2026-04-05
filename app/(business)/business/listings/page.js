"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { primaryPhotoUrl } from "@/lib/listingPhotos";
import { getLowStockThreshold, normalizeInventory } from "@/lib/inventory";
import { useTheme } from "@/components/ThemeProvider";
import SafeImage from "@/components/SafeImage";
import InventorySelfTest from "@/components/debug/InventorySelfTest";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { getListingPublicRef } from "@/lib/ids/publicRefs";
import { getListingCategoryLabel } from "@/lib/taxonomy/compat";
import { getListingCategoryPlaceholder } from "@/lib/taxonomy/placeholders";

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
  const [inventoryUpdatingId, setInventoryUpdatingId] = useState(null);
  const inventoryPollRef = useRef(null);
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
    return () => {
      if (inventoryPollRef.current) {
        clearTimeout(inventoryPollRef.current);
      }
    };
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

  async function updateListingInventory(listingId, updates) {
    if (!user) {
      alert("Connection not ready. Please try again.");
      return;
    }

    const clearPoll = () => {
      if (inventoryPollRef.current) {
        clearTimeout(inventoryPollRef.current);
        inventoryPollRef.current = null;
      }
    };

    clearPoll();
    setInventoryUpdatingId(listingId);
    try {
      const payload = { ...updates };
      const response = await fetchWithTimeout("/api/inventory/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, updates: payload }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to start inventory update.");
      }

      const syncPayload = await response.json();
      const { jobId, listingId: jobListingId } = syncPayload || {};
      if (process.env.NEXT_PUBLIC_DEBUG_PERF === "true") {
        console.info("[inventory] sync response", syncPayload);
      }
      if (!jobId) {
        throw new Error("Inventory update job could not be created.");
      }
      const isValidJobId = /^[0-9a-fA-F-]{36}$/.test(jobId);
      if (!isValidJobId) {
        throw new Error("Inventory update job id is invalid. Please retry.");
      }
      if (jobListingId && jobListingId !== listingId) {
        setInventoryUpdatingId(null);
        alert("Another inventory update is already in progress. Please wait.");
        return;
      }

      try {
        await fetchWithTimeout(`/api/inventory/jobs/${jobId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        console.warn("Inventory job trigger failed, relying on polling.", err);
      }

      const applyInventoryUpdate = (listingUpdate) => {
        setListings((prev) => {
          const next = prev.map((item) =>
            item.id === listingId ? { ...item, ...listingUpdate } : item
          );
          try {
            sessionStorage.setItem("yb_business_listings", JSON.stringify(next));
          } catch {
            // ignore cache write errors
          }
          return next;
        });
      };

      const pollJob = async () => {
        try {
          if (!jobId || !/^[0-9a-fA-F-]{36}$/.test(jobId)) {
            throw new Error("Inventory update job id is missing. Please retry.");
          }
          if (process.env.NEXT_PUBLIC_DEBUG_PERF === "true") {
            console.info("[inventory] polling job", jobId);
          }
          const statusRes = await fetchWithTimeout(
            `/api/inventory/jobs/${jobId}`,
            { method: "GET" }
          );
          if (!statusRes.ok) {
            let errorPayload = null;
            try {
              errorPayload = await statusRes.json();
            } catch {}
            if (errorPayload?.code === "42P01") {
              throw new Error(
                "Inventory jobs table is missing. Please run the latest migration."
              );
            }
            throw new Error(
              errorPayload?.details ||
                errorPayload?.error ||
                "Failed to check job status."
            );
          }

          const payload = await statusRes.json();
          const job = payload?.job || payload;
          if (job?.status === "succeeded") {
            applyInventoryUpdate({
              ...updates,
              inventory_last_updated_at:
                job?.completed_at || new Date().toISOString(),
            });
            setInventoryUpdatingId(null);
            clearPoll();
            return;
          }
          if (job?.status === "failed") {
            throw new Error(job?.error || "Inventory update failed.");
          }
        } catch (err) {
          console.error("❌ Inventory job error:", err);
          alert(err?.message || "Failed to update inventory status.");
          setInventoryUpdatingId(null);
          clearPoll();
          return;
        }

        inventoryPollRef.current = setTimeout(pollJob, 1500);
      };

      pollJob();
    } catch (err) {
      console.error("❌ Update inventory error:", err);
      alert(err?.message || "Failed to update inventory status.");
      clearPoll();
      setInventoryUpdatingId(null);
    }
  }

  const cancelInventoryUpdate = () => {
    if (inventoryPollRef.current) {
      clearTimeout(inventoryPollRef.current);
      inventoryPollRef.current = null;
    }
    setInventoryUpdatingId(null);
  };

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
      {process.env.NODE_ENV !== "production" ? <InventorySelfTest /> : null}
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
              const isUpdating = inventoryUpdatingId === listing.id;
              const threshold = getLowStockThreshold(listing);
              const currentQuantity = Number(listing.inventory_quantity);
              const restockQuantity =
                Number.isFinite(currentQuantity) && currentQuantity > 0
                  ? currentQuantity
                  : Math.max(10, threshold * 2);
              const availabilityPalette = {
                available: {
                  light: { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" },
                  dark: { bg: "#064e3b", text: "#d1fae5", border: "#047857" },
                },
                low: {
                  light: { bg: "#fffbeb", text: "#92400e", border: "#fde68a" },
                  dark: { bg: "#78350f", text: "#fef3c7", border: "#b45309" },
                },
                out: {
                  light: { bg: "#fef2f2", text: "#991b1b", border: "#fecaca" },
                  dark: { bg: "#7f1d1d", text: "#ffe4e6", border: "#be123c" },
                },
              };
              const badgeStyle = isLight
                ? availabilityPalette[inventory.availability]?.light
                : availabilityPalette[inventory.availability]?.dark;

              return (
                <div
                  key={listing.id}
                  className={`group relative flex flex-col overflow-hidden rounded-lg border transition-all duration-200 ${
                    isLight
                      ? "bg-white border-slate-200 hover:border-slate-300 hover:shadow-lg"
                      : "bg-slate-900 border-slate-700 hover:border-slate-600 hover:shadow-xl"
                  }`}
                >
                  {/* Image Section */}
                  {primaryPhotoUrl(listing.photo_url) ? (
                    <div
                      className={`relative h-56 w-full overflow-hidden ${
                        isLight ? "bg-white" : "bg-slate-800"
                      }`}
                    >
                      <SafeImage
                        src={primaryPhotoUrl(listing.photo_url)}
                        alt={listing.title}
                        className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                        style={{ objectFit: "contain", objectPosition: "center" }}
                        fallbackSrc={getListingCategoryPlaceholder(listing)}
                      />
                      {/* Inventory Badge Overlay */}
                      <div className="absolute top-2 right-2">
                        <span
                          className="inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur-sm"
                          style={
                            badgeStyle
                              ? {
                                  backgroundColor: badgeStyle.bg,
                                  color: badgeStyle.text,
                                  border: `1px solid ${badgeStyle.border}`
                                }
                              : undefined
                          }
                        >
                          {inventory.label}
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
                      className={`text-xs font-medium mb-1 ${
                        isLight ? "text-slate-600" : "text-slate-400"
                      }`}
                    >
                      {getListingCategoryLabel(listing, "Uncategorized")}
                    </p>

                    {/* Title */}
                    <h3
                      className={`text-base font-semibold mb-2 line-clamp-2 min-h-[3rem] ${
                        isLight ? "text-slate-900" : "text-slate-100"
                      }`}
                    >
                      {listing.title || "Untitled listing"}
                    </h3>

                    {/* Price */}
                    <div className="mb-3">
                      <span
                        className={`text-2xl font-bold ${
                          isLight ? "text-slate-900" : "text-slate-100"
                        }`}
                      >
                        {listing.price
                          ? new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: "USD",
                            }).format(Number(listing.price))
                          : "Price TBD"}
                      </span>
                    </div>

                    {/* Stock Info */}
                    <div className={`text-sm mb-4 ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                      <div className="flex items-center justify-between">
                        <span>Stock:</span>
                        <span className="font-semibold">
                          {listing.inventory_quantity ?? "—"}
                        </span>
                      </div>
                    </div>

                    {/* Spacer to push buttons to bottom */}
                    <div className="flex-1"></div>

                    {/* Action Buttons */}
                    <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                      {/* Primary Actions */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() =>
                            router.push(
                              `/business/listings/${encodeURIComponent(
                                getListingPublicRef(listing) || listing.id
                              )}/edit`
                            )
                          }
                          className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                            isLight
                              ? "bg-slate-100 text-slate-900 hover:bg-slate-200"
                              : "bg-slate-800 text-slate-100 hover:bg-slate-700"
                          }`}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(listing.id)}
                          className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                            isLight
                              ? "bg-red-50 text-red-700 hover:bg-red-100"
                              : "bg-red-900/30 text-red-300 hover:bg-red-900/50"
                          }`}
                        >
                          Delete
                        </button>
                      </div>

                      {/* Inventory Actions */}
                      <div className="pt-3">
                        {isUpdating ? (
                          <div className="grid grid-cols-2 gap-2">
                            <div className={`col-span-2 px-3 py-2 rounded-md text-sm font-medium text-center ${
                              isLight ? "bg-blue-50 text-blue-700" : "bg-blue-900/30 text-blue-300"
                            }`}>
                              Updating...
                            </div>
                            <button
                              type="button"
                              onClick={cancelInventoryUpdate}
                              className={`col-span-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                isLight
                                  ? "bg-slate-100 text-slate-900 hover:bg-slate-200"
                                  : "bg-slate-800 text-slate-100 hover:bg-slate-700"
                              }`}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <details className="group/details relative">
                          <summary className={`cursor-pointer list-none px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                            isLight
                              ? "bg-slate-100 text-slate-900 hover:bg-slate-200"
                              : "bg-slate-800 text-slate-100 hover:bg-slate-700"
                          }`}>
                            <div className="flex items-center justify-between">
                              <span>Inventory actions</span>
                              <svg className="w-4 h-4 transition-transform group-open/details:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </summary>
                          <div className={`absolute bottom-full left-0 right-0 mb-2 grid grid-cols-1 gap-2 p-2 rounded-md shadow-lg border z-10 ${
                            isLight
                              ? "bg-white border-slate-200"
                              : "bg-slate-800 border-slate-600"
                          }`}>
                            <button
                              onClick={() =>
                                updateListingInventory(listing.id, {
                                  inventory_status: "in_stock",
                                  inventory_quantity: restockQuantity,
                                })
                              }
                              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                isLight
                                  ? "bg-green-50 text-green-700 hover:bg-green-100"
                                  : "bg-green-900/30 text-green-300 hover:bg-green-900/50"
                              }`}
                            >
                              Restock
                            </button>
                            <button
                              onClick={() =>
                                updateListingInventory(listing.id, {
                                  inventory_status: "out_of_stock",
                                  inventory_quantity: 0,
                                })
                              }
                              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                isLight
                                  ? "bg-slate-100 text-slate-900 hover:bg-slate-200"
                                  : "bg-slate-800 text-slate-100 hover:bg-slate-700"
                              }`}
                            >
                              Mark out of stock
                            </button>
                            <button
                              onClick={() =>
                                updateListingInventory(listing.id, {
                                  inventory_status: "seasonal",
                                })
                              }
                              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                isLight
                                  ? "bg-slate-100 text-slate-900 hover:bg-slate-200"
                                  : "bg-slate-800 text-slate-100 hover:bg-slate-700"
                              }`}
                            >
                              Pause listing
                            </button>
                          </div>
                        </details>
                        )}
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
