"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import useBusinessProfileAccessGate from "@/components/auth/useBusinessProfileAccessGate";
import { useLocation } from "@/components/location/LocationProvider";
import CustomerMap from "@/components/customer/CustomerMap";
import { getCustomerBusinessUrl } from "@/lib/ids/publicRefs";
import {
  BUSINESS_CATEGORIES,
  normalizeCategoryName,
} from "@/lib/businessCategories";
import { getLocationCacheKey } from "@/lib/location";
import { hasCoordinates } from "@/lib/location/filter";
import NearbySplitViewShell from "./_components/NearbySplitViewShell";
import NearbyResultsPane from "./_components/NearbyResultsPane";
import styles from "./nearby.module.css";

const isSameBusinessList = (prev, next) => {
  if (!Array.isArray(prev) || !Array.isArray(next)) return false;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    if (prev[i]?.id !== next[i]?.id) return false;
  }
  return true;
};

const normalizeNum = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const NAV_OFFSET = 88;
const getBusinessSelection = (business) => {
  if (!business) return null;
  const lat = normalizeNum(
    business.coords?.lat ?? business.latitude ?? business.lat ?? business.location?.lat
  );
  const lng = normalizeNum(
    business.coords?.lng ?? business.longitude ?? business.lng ?? business.location?.lng
  );
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const id = business.id || business.public_id || null;
  return {
    id,
    lat,
    lng,
  };
};

export default function NearbyBusinessesClient() {
  const router = useRouter();
  const { user, loadingUser } = useAuth();
  const gateBusinessProfileAccess = useBusinessProfileAccessGate();
  const searchParams = useSearchParams();
  const { location, hydrated: locationHydrated, requestGpsLocation } = useLocation();

  const mapEnabled = process.env.NEXT_PUBLIC_HOME_BISECT_MAP !== "0";
  const mapAvailable = mapEnabled && process.env.NEXT_PUBLIC_DISABLE_MAP !== "1";
  const locationKey = getLocationCacheKey(location);
  const storageKey = locationKey
    ? `yb_customer_nearby_businesses_${locationKey}`
    : "yb_customer_nearby_businesses";

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [mobileView, setMobileView] = useState("list");
  const [isMobile, setIsMobile] = useState(false);

  const [ybBusinesses, setYbBusinesses] = useState([]);
  const [ybBusinessesLoading, setYbBusinessesLoading] = useState(true);
  const [ybBusinessesError, setYbBusinessesError] = useState(null);
  const [hasLoadedYb, setHasLoadedYb] = useState(false);

  const [hoveredBusinessId, setHoveredBusinessId] = useState(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState(null);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [mapControls, setMapControls] = useState(null);

  const cardRefs = useRef(new Map());
  const hasLoadedYbRef = useRef(false);
  const ybFetchedRef = useRef(false);
  const ybRequestIdRef = useRef(0);
  const gpsRequestedRef = useRef(false);

  useEffect(() => {
    const initial = (() => {
      if (typeof window === "undefined") return [];
      try {
        const cached = sessionStorage.getItem(storageKey);
        const parsed = cached ? JSON.parse(cached) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();

    setYbBusinesses(initial);
    setHasLoadedYb(initial.length > 0);
    setYbBusinessesLoading(initial.length === 0);
    setYbBusinessesError(null);
  }, [storageKey]);

  useEffect(() => {
    hasLoadedYbRef.current = hasLoadedYb;
  }, [hasLoadedYb]);

  useEffect(() => {
    if (!locationHydrated || gpsRequestedRef.current) return;
    gpsRequestedRef.current = true;
    void requestGpsLocation();
  }, [locationHydrated, requestGpsLocation]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.documentElement.setAttribute("data-route", "customer-nearby");
    return () => {
      if (document.documentElement.getAttribute("data-route") === "customer-nearby") {
        document.documentElement.removeAttribute("data-route");
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(max-width: 767px)");
    const handleChange = (event) => setIsMobile(event.matches);
    setIsMobile(media.matches);
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

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
    if (!locationHydrated) return;
    if (!locationKey) {
      setYbBusinesses([]);
      setHasLoadedYb(true);
      setYbBusinessesLoading(false);
      setYbBusinessesError(null);
      return;
    }

    let active = true;
    const loadYb = async () => {
      const requestId = ++ybRequestIdRef.current;
      ybFetchedRef.current = true;
      setYbBusinessesLoading((prev) => (hasLoadedYbRef.current ? prev : true));
      setYbBusinessesError(null);

      try {
        let rows = [];
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(
            () => controller.abort(new DOMException("Timeout", "AbortError")),
            12000
          );
          const params = new URLSearchParams();
          if (location.city && location.region) {
            params.set("city", location.city);
            params.set("state", location.region);
          }
          if (hasCoordinates(location)) {
            params.set("lat", String(location.lat));
            params.set("lng", String(location.lng));
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

        const mapped = rows
          .map((row) => {
            const lat = normalizeNum(row.latitude ?? row.lat ?? row.location_lat);
            const lng = normalizeNum(row.longitude ?? row.lng ?? row.location_lng);
            const hasCoords =
              typeof lat === "number" &&
              typeof lng === "number" &&
              !(lat === 0 && lng === 0);

            return {
              id: row.id,
              public_id: row.public_id || null,
              name: row.business_name || row.name || "Local business",
              category: row.category || "Local business",
              categoryLabel: row.category || "Local business",
              address: row.city
                ? `${row.address || ""}${row.address ? ", " : ""}${row.city}`
                : row.address || "",
              neighborhood:
                row.neighborhood || row.neighbourhood || row.district || row.area || "",
              city: row.city || "",
              state: row.state || row.state_code || row.region || "",
              zip_code: row.zip_code || row.zip || "",
              description: row.description || row.bio || "",
              website: row.website || "",
              imageUrl: row.profile_photo_url || row.photo_url || "",
              rating: normalizeNum(row.rating),
              open_now:
                typeof row.open_now === "boolean"
                  ? row.open_now
                  : typeof row.is_open === "boolean"
                    ? row.is_open
                    : null,
              distance_km: normalizeNum(row.distance_km),
              source: "supabase_businesses",
              coords: hasCoords ? { lat, lng } : null,
            };
          })
          .filter(Boolean);

        const next = mapped.length ? mapped : [];
        setYbBusinesses((prev) => (isSameBusinessList(prev, next) ? prev : next));
        setHasLoadedYb(true);
        if (!next.length) {
          setYbBusinessesError("No businesses available for this location yet.");
        }

        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem(storageKey, JSON.stringify(next));
          } catch {
            /* ignore cache errors */
          }
        }
      } catch (err) {
        console.warn("Failed to load nearby businesses", err);
        if (!active || requestId !== ybRequestIdRef.current) return;
        setYbBusinesses((prev) => (isSameBusinessList(prev, []) ? prev : []));
        setHasLoadedYb(true);
        setYbBusinessesError("Could not load businesses yet. Please try again.");
      } finally {
        if (active && requestId === ybRequestIdRef.current) {
          setYbBusinessesLoading(false);
        }
      }
    };

    loadYb();

    return () => {
      active = false;
    };
  }, [locationHydrated, locationKey, location, storageKey]);

  const showLocationEmpty = locationHydrated && !locationKey;
  const activeBusinessId = hoveredBusinessId || selectedBusinessId || null;

  const filteredBusinesses = useMemo(() => {
    const q = search.trim().toLowerCase();
    const categoryFilterNormalized = categoryFilter.trim().toLowerCase();
    return ybBusinesses.filter((biz) => {
      if (!biz) return false;
      const category =
        biz.categoryLabel?.toLowerCase() || biz.category?.toLowerCase() || "";
      const matchesCategory =
        !categoryFilterNormalized ||
        categoryFilterNormalized === "all" ||
        category === categoryFilterNormalized;
      if (!matchesCategory) return false;
      if (!q) return true;
      const name = biz.name?.toLowerCase() || "";
      const desc = biz.description?.toLowerCase() || "";
      const address = biz.address?.toLowerCase() || "";
      return (
        name.includes(q) ||
        category.includes(q) ||
        desc.includes(q) ||
        address.includes(q)
      );
    });
  }, [search, ybBusinesses, categoryFilter]);

  const businessesForMap = useMemo(() => filteredBusinesses, [filteredBusinesses]);

  useEffect(() => {
    if (!filteredBusinesses.length) {
      setSelectedBusinessId(null);
      setSelectedBusiness(null);
      setHoveredBusinessId(null);
      return;
    }
    if (selectedBusinessId == null) return;
    const stillExists = filteredBusinesses.some((biz) => biz.id === selectedBusinessId);
    if (!stillExists) {
      setSelectedBusinessId(null);
      setSelectedBusiness(null);
    }
  }, [filteredBusinesses, selectedBusinessId]);

  const registerCard = useCallback((id, node) => {
    if (!id) return;
    if (node) {
      cardRefs.current.set(id, node);
    } else {
      cardRefs.current.delete(id);
    }
  }, []);

  const onCardClick = useCallback(
    (business) => {
      if (isMobile) {
        const target = getCustomerBusinessUrl(business);
        if (!gateBusinessProfileAccess(undefined, target)) return;
        router.push(target);
        return;
      }
      if (!business?.id) return;
      setSelectedBusinessId(business.id);
      setSelectedBusiness(getBusinessSelection(business));
      setHoveredBusinessId(business.id);
      if (mapControls?.focusBusiness) {
        mapControls.focusBusiness(business);
      }
    },
    [gateBusinessProfileAccess, isMobile, mapControls, router]
  );

  const onMarkerClick = useCallback((businessId) => {
    if (!businessId) return;
    setSelectedBusinessId(businessId);
    setHoveredBusinessId(businessId);
    const selected = filteredBusinesses.find((biz) => String(biz.id) === String(businessId));
    setSelectedBusiness(getBusinessSelection(selected));
    const node = cardRefs.current.get(businessId);
    if (node) {
      node.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
    }
    setMobileView("list");
  }, [filteredBusinesses]);

  const onCardMapFocusClick = useCallback(
    (business) => {
      if (!business?.id) return;
      const selected = getBusinessSelection(business);
      if (!selected) return;
      setSelectedBusinessId(business.id);
      setSelectedBusiness(selected);
      setHoveredBusinessId(business.id);
      setMobileView("map");
    },
    []
  );

  useEffect(() => {
    if (!isMobile || mobileView !== "map" || !mapControls?.resize) return undefined;
    let rafId = 0;
    const timerId = window.setTimeout(() => {
      rafId = window.requestAnimationFrame(() => {
        mapControls.resize?.();
      });
    }, 80);
    return () => {
      window.clearTimeout(timerId);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [isMobile, mapControls, mobileView]);

  const controls = (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:p-3.5">
      <div className="flex flex-col gap-2 md:grid md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-center md:gap-3">
        <label className="block w-full min-w-0">
          <span className="sr-only">Search nearby businesses</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, category, or address"
            data-testid="nearby-search-input"
            className="h-11 w-full rounded-xl border border-white/15 bg-white px-3 text-sm font-normal text-[var(--yb-text)] placeholder:font-normal placeholder:text-[var(--yb-text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 focus:border-violet-300/60"
          />
        </label>

        <div className="flex items-center gap-2 md:hidden">
          <div className="inline-flex shrink-0 rounded-xl border border-white/15 bg-black/35 p-1">
            {[
              { key: "list", label: "List" },
              { key: "map", label: "Map" },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setMobileView(item.key)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  mobileView === item.key
                    ? "bg-violet-500/70 text-white shadow"
                    : "text-white/75 hover:text-white"
                }`}
                aria-pressed={mobileView === item.key}
                data-testid={`nearby-toggle-${item.key}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="block min-w-0 flex-1">
            <span className="sr-only">Filter by category</span>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              data-testid="nearby-category-select"
              className="h-11 w-full min-w-0 rounded-xl border border-white/15 bg-white px-3 text-sm font-normal text-[var(--yb-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 focus:border-violet-300/60"
            >
              <option value="All">All categories</option>
              {BUSINESS_CATEGORIES.map((category) => (
                <option key={category.id || category.name} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="hidden md:block">
          <span className="sr-only">Filter by category</span>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            data-testid="nearby-category-select"
            className="h-11 w-full rounded-xl border border-white/15 bg-white px-3 text-sm font-normal text-[var(--yb-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 focus:border-violet-300/60"
          >
            <option value="All">All categories</option>
            {BUSINESS_CATEGORIES.map((category) => (
              <option key={category.id || category.name} value={category.name}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 md:justify-self-end">
          {filteredBusinesses.length} results
        </div>
      </div>
    </div>
  );

  if (loadingUser && !user) {
    return (
      <div className="relative min-h-screen px-6 pt-10 text-white">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-0 bg-[#05010d]" />
          <div className="absolute inset-0 bg-gradient-to-b from-purple-900/40 via-fuchsia-900/30 to-black" />
        </div>
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-white/80" />
        </div>
      </div>
    );
  }

  return (
    <section
      className={`relative min-h-screen w-full pb-6 pt-0 text-white ${styles.nearbyPage}`}
      data-testid="nearby-page-root"
    >
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#05010d]" />
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/40 via-fuchsia-900/30 to-black" />
      </div>

      <div className="relative z-10 w-full px-5 sm:px-6 md:px-8 lg:px-12">
        {showLocationEmpty ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/75">
            Select a location to see nearby businesses.
          </div>
        ) : (
          <NearbySplitViewShell
            mobileView={mobileView}
            onMobileViewChange={setMobileView}
            renderMobileToggle={false}
            controls={controls}
            resultsPane={
              <NearbyResultsPane
                businesses={filteredBusinesses}
                loading={ybBusinessesLoading && !hasLoadedYb}
                error={ybBusinessesError}
                activeBusinessId={activeBusinessId}
                selectedBusinessId={selectedBusinessId}
                onCardHover={setHoveredBusinessId}
                onCardLeave={() => setHoveredBusinessId(null)}
                onCardClick={onCardClick}
                onCardMapFocusClick={onCardMapFocusClick}
                isMobile={isMobile}
                registerCard={registerCard}
                onResetFilters={() => {
                  setSearch("");
                  setCategoryFilter("All");
                }}
              />
            }
            mapPane={
              <div
                className="relative h-[60vh] min-h-[360px] md:h-full md:min-h-0"
                data-testid="nearby-map-canvas"
              >
                <CustomerMap
                  mapEnabled={mapAvailable}
                  mapBusinesses={businessesForMap}
                  enableSearch={false}
                  preferredCenter={
                    Number.isFinite(location.lat) && Number.isFinite(location.lng)
                      ? { lat: location.lat, lng: location.lng }
                      : null
                  }
                  onControlsReady={setMapControls}
                  activeBusinessId={activeBusinessId}
                  hoveredBusinessId={hoveredBusinessId}
                  selectedBusiness={selectedBusiness}
                  selectedBusinessId={selectedBusinessId}
                  markerClickBehavior="select"
                  onMarkerHover={setHoveredBusinessId}
                  onMarkerLeave={() => setHoveredBusinessId(null)}
                  onMarkerClick={onMarkerClick}
                  showRecenterControl
                  />
              </div>
            }
          />
        )}
      </div>
    </section>
  );
}
