"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, LayoutGrid, Search, TableProperties } from "lucide-react";
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
import {
  BUSINESS_LISTINGS_VIEW_GRID,
  BUSINESS_LISTINGS_VIEW_STORAGE_KEY,
  BUSINESS_LISTINGS_VIEW_TABLE,
  filterAndSortListings,
  getCustomerFacingPrice,
  getListingCategoryFilterValue,
  getListingRef,
  getListingSku,
  getListingStatus,
  getListingStock,
  getListingUpdatedAt,
} from "@/lib/business/listingsCatalog";

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

function formatUpdatedDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export default function BusinessListingsPage() {
  const { supabase, user, loadingUser } = useAuth();
  const router = useRouter();
  const { theme, hydrated } = useTheme();
  const isLight = hydrated ? theme === "light" : true;
  const [isHydrating, setIsHydrating] = useState(true);
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === "undefined") return BUSINESS_LISTINGS_VIEW_GRID;
    try {
      const storedView = window.localStorage.getItem(BUSINESS_LISTINGS_VIEW_STORAGE_KEY);
      return storedView === BUSINESS_LISTINGS_VIEW_TABLE
        ? BUSINESS_LISTINGS_VIEW_TABLE
        : BUSINESS_LISTINGS_VIEW_GRID;
    } catch {
      return BUSINESS_LISTINGS_VIEW_GRID;
    }
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortKey, setSortKey] = useState("updated");
  const [copiedRef, setCopiedRef] = useState("");

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
  const categoryOptions = useMemo(() => {
    const values = Array.from(
      new Set(listings.map((listing) => getListingCategoryFilterValue(listing)).filter(Boolean))
    );
    return values.sort((left, right) => left.localeCompare(right));
  }, [listings]);
  const visibleListings = useMemo(
    () =>
      filterAndSortListings(listings, {
        search: searchQuery,
        status: statusFilter,
        category: categoryFilter,
        sort: sortKey,
      }),
    [categoryFilter, listings, searchQuery, sortKey, statusFilter]
  );
  const hasActiveCatalogFilters =
    searchQuery.trim().length > 0 || statusFilter !== "all" || categoryFilter !== "all";

  useEffect(() => {
    const handleVisibility = () => setIsVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    setIsHydrating(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(BUSINESS_LISTINGS_VIEW_STORAGE_KEY, viewMode);
    } catch {
      // ignore storage errors
    }
  }, [viewMode]);

  useEffect(() => {
    if (!copiedRef) return undefined;
    const timeoutId = setTimeout(() => setCopiedRef(""), 1500);
    return () => clearTimeout(timeoutId);
  }, [copiedRef]);

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

  async function handleCopyListingRef(event, listing) {
    event.stopPropagation();
    const listingRef = getListingRef(listing);
    if (!listingRef || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(listingRef);
      setCopiedRef(listingRef);
    } catch {
      // ignore clipboard errors
    }
  }

  function resetCatalogFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setCategoryFilter("all");
    setSortKey("updated");
  }

  function renderListingActions(listing) {
    const isDraft = String(listing.status || "").trim().toLowerCase() === "draft";
    const previewHref = `/business/listings/${encodeURIComponent(
      getListingPublicRef(listing) || listing.id
    )}/preview`;

    return (
      <>
        <button
          onClick={(event) => {
            event.stopPropagation();
            router.push(`/business/listings/${encodeURIComponent(
              getListingPublicRef(listing) || listing.id
            )}/edit`);
          }}
          className={`rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors ${
            isLight
              ? "border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50"
              : "border-slate-600 text-slate-200 hover:border-slate-500 hover:bg-slate-800"
          }`}
        >
          Edit
        </button>
        <a
          href={previewHref}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className={`rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors ${
            isLight
              ? "border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50"
              : "border-slate-600 text-slate-200 hover:border-slate-500 hover:bg-slate-800"
          }`}
        >
          Preview
        </a>
        {isDraft ? (
          <button
            onClick={(event) => {
              event.stopPropagation();
              handleStatusChange(listing.id, "published");
            }}
            className="yb-primary-button rounded-md px-2.5 py-1.5 text-sm font-semibold text-white"
          >
            Publish
          </button>
        ) : (
          <button
            onClick={(event) => {
              event.stopPropagation();
              handleStatusChange(listing.id, "draft");
            }}
            className={`rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors ${
              isLight
                ? "border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                : "border-slate-600 text-slate-200 hover:border-slate-500 hover:bg-slate-800"
            }`}
          >
            Unpublish
          </button>
        )}
        <button
          onClick={(event) => {
            event.stopPropagation();
            handleDelete(listing.id);
          }}
          className={`px-1 py-1.5 text-sm font-medium transition-colors ${
            isLight ? "text-slate-500 hover:text-slate-900" : "text-slate-400 hover:text-slate-100"
          }`}
        >
          Delete
        </button>
      </>
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

      {/* Catalog */}
      {listings.length > 0 && (
        <div className="mt-12 space-y-8">
          <div className="flex items-start justify-between">
            <div>
              <h2 className={`text-xl font-bold ${isLight ? "text-slate-900" : "text-slate-100"}`}>
                Catalog
              </h2>
              <p className={`text-sm ${isLight ? "text-slate-700" : "text-slate-400"}`}>
                Search, filter, and manage your listings in whichever view fits your catalog.
              </p>
            </div>
          </div>

          <div
            className={`mt-6 rounded-2xl border p-4 shadow-sm ${
              isLight ? "border-slate-200 bg-white" : "border-slate-700 bg-slate-900"
            }`}
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_180px_220px_180px]">
                <label
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                    isLight ? "border-slate-200 bg-slate-50" : "border-slate-700 bg-slate-800"
                  }`}
                >
                  <Search className={`h-4 w-4 ${isLight ? "text-slate-400" : "text-slate-500"}`} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search title, ref, or SKU"
                    className={`w-full bg-transparent text-sm outline-none ${
                      isLight ? "text-slate-900 placeholder:text-slate-400" : "text-slate-100 placeholder:text-slate-500"
                    }`}
                  />
                </label>

                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className={`rounded-xl border px-3 py-2.5 text-sm outline-none ${
                    isLight ? "border-slate-200 bg-slate-50 text-slate-900" : "border-slate-700 bg-slate-800 text-slate-100"
                  }`}
                >
                  <option value="all">All statuses</option>
                  <option value="live">Live</option>
                  <option value="draft">Draft</option>
                  <option value="out_of_stock">Out of stock</option>
                </select>

                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className={`rounded-xl border px-3 py-2.5 text-sm outline-none ${
                    isLight ? "border-slate-200 bg-slate-50 text-slate-900" : "border-slate-700 bg-slate-800 text-slate-100"
                  }`}
                >
                  <option value="all">All categories</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>

                <select
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value)}
                  className={`rounded-xl border px-3 py-2.5 text-sm outline-none ${
                    isLight ? "border-slate-200 bg-slate-50 text-slate-900" : "border-slate-700 bg-slate-800 text-slate-100"
                  }`}
                >
                  <option value="updated">Last updated</option>
                  <option value="name">Name</option>
                  <option value="price">Price</option>
                  <option value="stock">Stock</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div
                  className={`inline-flex rounded-xl border p-1 ${
                    isLight ? "border-violet-100 bg-violet-50/70" : "border-slate-700 bg-slate-800"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setViewMode(BUSINESS_LISTINGS_VIEW_GRID)}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      viewMode === BUSINESS_LISTINGS_VIEW_GRID
                        ? "bg-violet-100 text-violet-700"
                        : isLight
                          ? "text-slate-600 hover:bg-white hover:text-violet-700"
                          : "text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    <LayoutGrid className="h-4 w-4" />
                    Grid
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode(BUSINESS_LISTINGS_VIEW_TABLE)}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      viewMode === BUSINESS_LISTINGS_VIEW_TABLE
                        ? "bg-violet-100 text-violet-700"
                        : isLight
                          ? "text-slate-600 hover:bg-white hover:text-violet-700"
                          : "text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    <TableProperties className="h-4 w-4" />
                    Table
                  </button>
                </div>

                {hasActiveCatalogFilters ? (
                  <button
                    type="button"
                    onClick={resetCatalogFilters}
                    className={`text-sm font-medium ${
                      isLight ? "text-slate-500 hover:text-slate-900" : "text-slate-400 hover:text-slate-100"
                    }`}
                  >
                    Reset filters
                  </button>
                ) : null}
              </div>
            </div>
            <div className={`mt-3 text-xs ${isLight ? "text-slate-500" : "text-slate-400"} xl:text-right`}>
              Buyer price includes marketplace fee.
            </div>
          </div>

          {visibleListings.length === 0 ? (
            <div
              className={`rounded-3xl border border-dashed p-10 text-center shadow-sm ${
                isLight ? "border-slate-300/80 bg-white" : "border-white/15 bg-slate-900/60"
              }`}
            >
              <h3 className="text-xl font-semibold">No listings match your filters.</h3>
              <p className={`mt-2 text-sm ${isLight ? "text-slate-600" : "text-slate-300"}`}>
                Try a different search, status, or category combination.
              </p>
              <button
                type="button"
                onClick={resetCatalogFilters}
                className={`mt-5 text-sm font-medium ${
                  isLight ? "text-violet-700 hover:text-violet-900" : "text-violet-300 hover:text-violet-100"
                }`}
              >
                Clear filters
              </button>
            </div>
          ) : viewMode === BUSINESS_LISTINGS_VIEW_TABLE ? (
            <div
              className={`overflow-hidden rounded-2xl border shadow-sm ${
                isLight ? "border-slate-200 bg-white" : "border-slate-700 bg-slate-900"
              }`}
            >
              <div className="overflow-x-auto">
                <table className="min-w-[1180px] w-full">
                  <thead className={isLight ? "bg-slate-50" : "bg-slate-800/70"}>
                    <tr className={isLight ? "text-slate-500" : "text-slate-400"}>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em]">Listing name</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em]">Ref / SKU</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em]">Category</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] whitespace-nowrap">Seller price</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] whitespace-nowrap">Buyer price</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em]">Stock</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em]">Status</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] whitespace-nowrap">Updated</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleListings.map((listing) => {
                      const listingStatus = getListingStatus(listing);
                      const listingRef = getListingRef(listing);
                      const listingSku = getListingSku(listing);
                      const stock = getListingStock(listing);
                      const customerFacingPrice = getCustomerFacingPrice(listing);
                      const editHref = `/business/listings/${encodeURIComponent(
                        getListingPublicRef(listing) || listing.id
                      )}/edit`;
                      const coverImageUrl = resolveListingCoverImageUrl(listing);

                      return (
                        <tr
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
                          className={`cursor-pointer border-t transition-colors ${
                            isLight
                              ? "border-slate-100 hover:bg-violet-50/35"
                              : "border-slate-800 hover:bg-slate-800/60"
                          }`}
                        >
                          <td className="px-3 py-4 align-top">
                            <div className="flex min-w-0 items-start gap-3">
                              <div className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border ${
                                isLight ? "border-slate-200 bg-slate-50" : "border-slate-700 bg-slate-800"
                              }`}>
                                {coverImageUrl ? (
                                  <SafeImage
                                    src={coverImageUrl}
                                    alt={listing.title}
                                    className="h-full w-full"
                                    style={{ objectFit: "cover", objectPosition: "center" }}
                                    fallbackSrc={getListingCategoryPlaceholder(listing)}
                                  />
                                ) : (
                                  <span className={`text-[10px] ${isLight ? "text-slate-400" : "text-slate-500"}`}>No image</span>
                                )}
                              </div>
                              <div className="min-w-0 max-w-[280px]">
                                <div className={`line-clamp-2 font-semibold ${isLight ? "text-slate-900" : "text-slate-100"}`}>
                                  {listing.title || "Untitled listing"}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-4 align-top text-xs">
                            <div className="max-w-[140px] space-y-1">
                              {listingRef ? (
                                <div className="flex items-center gap-2">
                                  <span className={`truncate whitespace-nowrap ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                                    Ref: {listingRef}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(event) => handleCopyListingRef(event, listing)}
                                    className={`inline-flex shrink-0 items-center text-xs opacity-70 transition hover:opacity-100 ${
                                      isLight ? "text-slate-400 hover:text-slate-700" : "text-slate-500 hover:text-slate-200"
                                    }`}
                                    aria-label={`Copy ref ${listingRef}`}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : null}
                              {listingSku ? (
                                <div className={`truncate whitespace-nowrap ${isLight ? "text-slate-400" : "text-slate-500"}`}>
                                  SKU: {listingSku}
                                </div>
                              ) : null}
                              {copiedRef === listingRef ? (
                                <div className={`text-[11px] ${isLight ? "text-slate-400" : "text-slate-500"}`}>
                                  Copied
                                </div>
                              ) : null}
                              {!listingRef && !listingSku ? (
                                <div className={isLight ? "text-slate-400" : "text-slate-500"}>—</div>
                              ) : null}
                            </div>
                          </td>
                          <td className={`px-3 py-4 align-top text-sm ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                            <div className="max-w-[150px] truncate">
                              {getListingCategoryLabel(listing, "Uncategorized")}
                            </div>
                          </td>
                          <td className={`px-3 py-4 align-top text-sm font-semibold whitespace-nowrap ${isLight ? "text-slate-900" : "text-slate-100"}`}>
                            {formatCurrency(listing.price) ?? "Price TBD"}
                          </td>
                          <td className={`px-3 py-4 align-top text-[13px] whitespace-nowrap ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                            {customerFacingPrice ? `${formatPriceCents(customerFacingPrice)}` : "—"}
                          </td>
                          <td className={`px-3 py-4 align-top text-sm whitespace-nowrap ${isLight ? "text-slate-600" : "text-slate-300"}`}>
                            {listingStatus.key === "out_of_stock" ? "Out of stock" : `${stock ?? "—"} in stock`}
                          </td>
                          <td className="px-3 py-4 align-top">
                            <span
                              className="inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
                              style={
                                listingStatus.key === "out_of_stock"
                                  ? {
                                      backgroundColor: "#ffffff",
                                      color: "#111827",
                                      border: "1px solid #e5e7eb",
                                      boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                                    }
                                  : listingStatus.label === "Draft"
                                    ? {
                                        backgroundColor: "#fff7ed",
                                        color: "#c2410c",
                                        border: "1px solid #fdba74",
                                      }
                                    : listingStatus.label === "Changes not published"
                                    ? {
                                          backgroundColor: "#faf5ff",
                                          color: "#7c3aed",
                                          border: "1px solid #ede9fe",
                                        }
                                      : {
                                          backgroundColor: "#f0fdf4",
                                          color: "#166534",
                                          border: "1px solid #bbf7d0",
                                        }
                              }
                            >
                              {listingStatus.label === "Changes not published"
                                ? "Unpublished changes"
                                : listingStatus.label}
                            </span>
                          </td>
                          <td className={`px-3 py-4 align-top text-sm whitespace-nowrap ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                            {formatUpdatedDate(getListingUpdatedAt(listing))}
                          </td>
                          <td className="px-3 py-4 align-top">
                            <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                              {renderListingActions(listing)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleListings.map((listing) => {
                const inventory = normalizeInventory(listing);
                const listingStatus = getListingStatus(listing);
                const isDraft = String(listing.status || "").trim().toLowerCase() === "draft";
                const hasUnpublishedChanges = listing.has_unpublished_changes === true;
                const isOutOfStock =
                  inventory.availability === "out" || Number(listing.inventory_quantity) === 0;
                const pricing = calculateListingPricing(listing.price);
                const sellerPriceLabel = formatCurrency(listing.price);
                const customerFacingPriceLabel =
                  pricing.finalPriceCents > pricing.basePriceCents
                    ? formatPriceCents(getCustomerFacingPrice(listing) ?? pricing.finalPriceCents)
                    : null;
                const safeListingRef = getListingRef(listing);
                const listingSku = getListingSku(listing);
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
                            {listingStatus.label}
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

                    <div className="flex flex-1 flex-col p-4">
                      <p
                        className={`mb-1 text-[11px] font-medium uppercase tracking-[0.08em] ${
                          isLight ? "text-slate-600" : "text-slate-400"
                        }`}
                      >
                        {getListingCategoryLabel(listing, "Uncategorized")}
                      </p>

                      <h3
                        className={`mb-2 min-h-[3rem] text-base font-semibold line-clamp-2 ${
                          isLight ? "text-slate-900" : "text-slate-100"
                        }`}
                      >
                        {listing.title || "Untitled listing"}
                      </h3>

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

                      <div className={`mb-3 text-sm ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                        {isOutOfStock ? (
                          <span className="font-semibold">Out of stock</span>
                        ) : (
                          <>
                            <span className="font-semibold">{listing.inventory_quantity ?? "—"}</span> in stock
                          </>
                        )}
                      </div>

                      {safeListingRef || listingSku ? (
                        <div
                          className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${
                            isLight ? "text-slate-500" : "text-slate-400"
                          }`}
                        >
                          {safeListingRef ? (
                            <span className="inline-flex items-center gap-1.5">
                              Ref: {safeListingRef}
                              <button
                                type="button"
                                onClick={(event) => handleCopyListingRef(event, listing)}
                                className={isLight ? "text-slate-400 hover:text-slate-700" : "text-slate-500 hover:text-slate-200"}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          ) : null}
                          {listingSku ? <span>SKU: {listingSku}</span> : null}
                          {copiedRef === safeListingRef ? <span>Copied</span> : null}
                        </div>
                      ) : null}

                      <div className="flex-1" />

                      <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                        <div className="flex flex-wrap items-center gap-2">{renderListingActions(listing)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
