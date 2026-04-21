"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import useBusinessProfileAccessGate from "@/components/auth/useBusinessProfileAccessGate";
import { useLocation } from "@/components/location/LocationProvider";
import { useModal } from "@/components/modals/ModalProvider";
import CustomerMap from "@/components/customer/CustomerMap";
import { getCustomerBusinessUrl } from "@/lib/ids/publicRefs";
import { setAuthIntent } from "@/lib/auth/authIntent";
import { getAuthedContext } from "@/lib/auth/getAuthedContext";
import { useCurrentAccountContext } from "@/lib/auth/useCurrentAccountContext";
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

const normalizeCategoryToken = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const NEW_BUSINESS_DAYS = 45;
const SAVED_BUSINESSES_EVENT = "yb:saved-businesses-changed";

const VERIFIED_STATUSES = new Set(["auto_verified", "manually_verified"]);

const daysSince = (value) => {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return (Date.now() - time) / (1000 * 60 * 60 * 24);
};

const timeValue = (value) => {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
};

const getBusinessQualityScore = (business) => {
  let score = 0;
  if (business?.imageUrl || business?.profile_photo_url || business?.cover_photo_url) score += 2;
  if (business?.description && String(business.description).trim().length >= 24) score += 2;
  if (business?.website) score += 1;
  if (business?.city && business?.state) score += 1;
  if (business?.coords) score += 1;
  return score;
};

const getSoftRankScore = (business) => {
  const distance = normalizeNum(business?.distance_km ?? business?.distanceKm);
  const distanceScore =
    typeof distance === "number" ? Math.max(0, 1 - Math.min(distance, 25) / 25) : 0;
  const updatedDays = daysSince(business?.updated_at);
  const createdDays = daysSince(business?.created_at);
  const activityScore =
    Number.isFinite(updatedDays) && updatedDays <= 30 ? (30 - updatedDays) / 30 : 0;
  const newScore =
    Number.isFinite(createdDays) && createdDays <= NEW_BUSINESS_DAYS
      ? (NEW_BUSINESS_DAYS - createdDays) / NEW_BUSINESS_DAYS
      : 0;

  return (
    (business?.isVerified ? 100 : 0) +
    getBusinessQualityScore(business) * 8 +
    activityScore * 10 +
    newScore * 7 +
    distanceScore * 4
  );
};

const buildHookLine = (business) => {
  const category = business?.categoryLabel || business?.category || "Local business";
  const city = business?.city || "";
  if (business?.isNew) return "New on YourBarrio";
  if (business?.isVerified) return "Verified local business";
  if (city) return `${category} in ${city}`;
  return `Discover this ${category.toLowerCase()} on YourBarrio`;
};

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
  const accountContext = useCurrentAccountContext();
  const { openModal } = useModal();
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
  const [businessCategoryOptions, setBusinessCategoryOptions] = useState([]);
  const [sortMode, setSortMode] = useState("recommended");
  const [mobileView, setMobileView] = useState("list");
  const [isMobile, setIsMobile] = useState(false);
  const [preciseLocationLoading, setPreciseLocationLoading] = useState(false);

  const [ybBusinesses, setYbBusinesses] = useState([]);
  const [ybBusinessesLoading, setYbBusinessesLoading] = useState(true);
  const [ybBusinessesError, setYbBusinessesError] = useState(null);
  const [hasLoadedYb, setHasLoadedYb] = useState(false);

  const [hoveredBusinessId, setHoveredBusinessId] = useState(null);
  const [selectedBusinessId, setSelectedBusinessId] = useState(null);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [mapControls, setMapControls] = useState(null);
  const [savedBusinessIds, setSavedBusinessIds] = useState(() => new Set());
  const [savingBusinessIds, setSavingBusinessIds] = useState(() => new Set());

  const cardRefs = useRef(new Map());
  const hasLoadedYbRef = useRef(false);
  const ybRequestIdRef = useRef(0);

  const savedBusinessesCacheKey = user?.id ? `yb_saved_businesses_${user.id}` : null;
  const showSaveControls = !accountContext.isBusiness && !accountContext.rolePending;

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
    if (!savedBusinessesCacheKey || !showSaveControls) {
      setSavedBusinessIds(new Set());
      return;
    }

    try {
      const raw = window.localStorage.getItem(savedBusinessesCacheKey);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setSavedBusinessIds(new Set(parsed.filter(Boolean)));
      }
    } catch {
      /* ignore cache errors */
    }
  }, [savedBusinessesCacheKey, showSaveControls]);

  useEffect(() => {
    let active = true;
    const loadSavedBusinesses = async () => {
      if (!user?.id || !showSaveControls) return;
      try {
        const { client, userId } = await getAuthedContext("loadSavedBusinesses");
        const { data, error } = await client
          .from("saved_businesses")
          .select("business_id")
          .eq("user_id", userId);
        if (error) throw error;
        if (!active) return;
        const ids = (data || []).map((row) => row.business_id).filter(Boolean);
        setSavedBusinessIds(new Set(ids));
        if (typeof window !== "undefined" && savedBusinessesCacheKey) {
          try {
            window.localStorage.setItem(savedBusinessesCacheKey, JSON.stringify(ids));
          } catch {
            /* ignore */
          }
        }
      } catch (err) {
        console.warn("Failed to load saved businesses", err);
      }
    };

    loadSavedBusinesses();
    return () => {
      active = false;
    };
  }, [savedBusinessesCacheKey, showSaveControls, user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncSavedBusinesses = (ids) => {
      if (Array.isArray(ids)) {
        setSavedBusinessIds(new Set(ids.filter(Boolean)));
      }
    };
    const onSavedBusinessesChanged = (event) => {
      syncSavedBusinesses(event?.detail?.ids);
    };
    const onStorage = (event) => {
      if (!savedBusinessesCacheKey || event.key !== savedBusinessesCacheKey) return;
      try {
        const parsed = event.newValue ? JSON.parse(event.newValue) : [];
        syncSavedBusinesses(parsed);
      } catch {
        syncSavedBusinesses([]);
      }
    };
    window.addEventListener(SAVED_BUSINESSES_EVENT, onSavedBusinessesChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SAVED_BUSINESSES_EVENT, onSavedBusinessesChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, [savedBusinessesCacheKey]);

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
    setSearch(urlQuery);
    setCategoryFilter(urlCategory || "All");
  }, [searchParams]);

  useEffect(() => {
    if (!businessCategoryOptions.length || categoryFilter === "All") return;
    const normalizedFilter = normalizeCategoryToken(categoryFilter);
    const matched = businessCategoryOptions.find((category) =>
      [category.id, category.slug, category.name]
        .map(normalizeCategoryToken)
        .includes(normalizedFilter)
    );
    if (matched && categoryFilter !== matched.slug) {
      setCategoryFilter(matched.slug);
    } else if (!matched) {
      setCategoryFilter("All");
    }
  }, [businessCategoryOptions, categoryFilter]);

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
          if (res.ok && Array.isArray(payload?.categories)) {
            setBusinessCategoryOptions(
              payload.categories
                .filter((category) => category?.id && category?.name)
                .map((category) => ({
                  id: category.id,
                  name: category.name,
                  slug: category.slug || normalizeCategoryToken(category.name),
                }))
            );
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
              businessCategoryId: row.business_category_id || null,
              businessCategorySlug: row.business_category_slug || null,
              businessCategoryName: row.business_category_name || null,
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
              imageUrl: row.cover_photo_url || row.profile_photo_url || row.photo_url || "",
              cover_photo_url: row.cover_photo_url || "",
              profile_photo_url: row.profile_photo_url || "",
              verification_status: row.verification_status || "",
              isVerified: VERIFIED_STATUSES.has(row.verification_status),
              created_at: row.created_at || null,
              updated_at: row.updated_at || null,
              rating: normalizeNum(row.rating),
              open_now:
                typeof row.open_now === "boolean"
                  ? row.open_now
                  : typeof row.is_open === "boolean"
                    ? row.is_open
                    : null,
              distance_km: normalizeNum(row.distance_km),
              discovery_rank: normalizeNum(row.discovery_rank),
              source: "supabase_businesses",
              coords: hasCoords ? { lat, lng } : null,
            };
          })
          .map((business) => {
            const isNew = daysSince(business.created_at) <= NEW_BUSINESS_DAYS;
            return {
              ...business,
              isNew,
              hookLine: buildHookLine({ ...business, isNew }),
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
    const categoryFilterNormalized = normalizeCategoryToken(categoryFilter);
    const filtered = ybBusinesses.filter((biz) => {
      if (!biz) return false;
      const category = biz.categoryLabel?.toLowerCase() || biz.category?.toLowerCase() || "";
      const categoryTokens = [
        biz.businessCategoryId,
        biz.businessCategorySlug,
        biz.businessCategoryName,
      ]
        .map(normalizeCategoryToken)
        .filter(Boolean);
      const matchesCategory =
        !categoryFilterNormalized ||
        categoryFilterNormalized === "all" ||
        categoryTokens.includes(categoryFilterNormalized);
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

    return [...filtered].sort((left, right) => {
      if (sortMode === "distance") {
        const leftDistance = normalizeNum(left.distance_km);
        const rightDistance = normalizeNum(right.distance_km);
        const safeLeft =
          typeof leftDistance === "number" ? leftDistance : Number.POSITIVE_INFINITY;
        const safeRight =
          typeof rightDistance === "number" ? rightDistance : Number.POSITIVE_INFINITY;
        return safeLeft - safeRight;
      }

      if (sortMode === "newest") {
        return timeValue(right.created_at) - timeValue(left.created_at);
      }

      const leftRank = normalizeNum(left.discovery_rank) ?? getSoftRankScore(left);
      const rightRank = normalizeNum(right.discovery_rank) ?? getSoftRankScore(right);
      const rankDelta = rightRank - leftRank;
      if (Math.abs(rankDelta) > 0.001) return rankDelta;
      return timeValue(right.updated_at || right.created_at) - timeValue(left.updated_at || left.created_at);
    });
  }, [search, ybBusinesses, categoryFilter, sortMode]);

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
      const target = getCustomerBusinessUrl(business);
      if (!gateBusinessProfileAccess(undefined, target)) return;
      router.push(target);
    },
    [gateBusinessProfileAccess, router]
  );

  const persistSavedBusinessIds = useCallback(
    (ids) => {
      if (typeof window === "undefined") return;
      const values = Array.from(ids).filter(Boolean);
      if (savedBusinessesCacheKey) {
        try {
          window.localStorage.setItem(savedBusinessesCacheKey, JSON.stringify(values));
        } catch {
          /* ignore */
        }
      }
      window.dispatchEvent(
        new CustomEvent(SAVED_BUSINESSES_EVENT, {
          detail: { ids: values },
        })
      );
    },
    [savedBusinessesCacheKey]
  );

  const onToggleSaveShop = useCallback(
    async (business) => {
      const businessId = business?.id;
      if (!businessId) return;
      if (!showSaveControls) return;

      if (!user?.id) {
        const currentPath =
          typeof window !== "undefined"
            ? `${window.location.pathname}${window.location.search}`
            : "/customer/nearby";
        setAuthIntent({ redirectTo: currentPath, role: "customer" });
        openModal("customer-login", { next: currentPath });
        return;
      }

      const wasSaved = savedBusinessIds.has(businessId);
      const optimistic = new Set(savedBusinessIds);
      if (wasSaved) {
        optimistic.delete(businessId);
      } else {
        optimistic.add(businessId);
      }
      setSavedBusinessIds(optimistic);
      persistSavedBusinessIds(optimistic);
      setSavingBusinessIds((prev) => new Set(prev).add(businessId));

      try {
        const response = await fetch("/api/customer/saved-businesses", {
          method: wasSaved ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ businessId }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error || "Save shop update failed");
        }
      } catch (err) {
        console.error("Save shop toggle failed", err);
        setSavedBusinessIds(savedBusinessIds);
        persistSavedBusinessIds(savedBusinessIds);
      } finally {
        setSavingBusinessIds((prev) => {
          const next = new Set(prev);
          next.delete(businessId);
          return next;
        });
      }
    },
    [openModal, persistSavedBusinessIds, savedBusinessIds, showSaveControls, user?.id]
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

  const onPreciseLocationClick = useCallback(async () => {
    setPreciseLocationLoading(true);
    try {
      await requestGpsLocation();
    } finally {
      setPreciseLocationLoading(false);
    }
  }, [requestGpsLocation]);

  useEffect(() => {
    if (mobileView !== "map" || !mapControls?.resize) return undefined;
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
  }, [mapControls, mobileView]);

  const locationLabel = location?.label || [location?.city, location?.region].filter(Boolean).join(", ");
  const usesPreciseLocation = location?.source === "gps";
  const controls = (
    <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-3 shadow-[0_16px_50px_rgba(15,23,42,0.07)] backdrop-blur-xl sm:p-4">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-violet-700">
            Discover local businesses
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
              Explore near {locationLabel || "Long Beach"}
            </h1>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {filteredBusinesses.length} results
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Browse shops first. Use the map whenever you want to explore by area.
          </p>
        </div>

        {!usesPreciseLocation ? (
          <button
            type="button"
            onClick={onPreciseLocationClick}
            disabled={preciseLocationLoading}
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700 disabled:cursor-wait disabled:opacity-70"
          >
            {preciseLocationLoading ? "Checking location..." : "Improve distance accuracy"}
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 lg:grid lg:grid-cols-[minmax(220px,1fr)_220px_180px_auto] lg:items-center lg:gap-3">
        <label className="block w-full min-w-0">
          <span className="sr-only">Search nearby businesses</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, category, or address"
            data-testid="nearby-search-input"
            className="h-11 w-full rounded-full border border-slate-200 bg-white px-4 text-sm font-normal text-slate-950 placeholder:font-normal placeholder:text-slate-400 focus:border-violet-300/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
          />
        </label>

        <label className="block">
          <span className="sr-only">Filter by category</span>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            data-testid="nearby-category-select"
            className="h-11 w-full rounded-full border border-slate-200 bg-white px-4 text-sm font-normal text-slate-950 focus:border-violet-300/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
          >
            <option value="All">All categories</option>
            {businessCategoryOptions.map((category) => (
              <option key={category.id || category.slug || category.name} value={category.slug || category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="sr-only">Sort businesses</span>
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value)}
            data-testid="nearby-sort-select"
            className="h-11 w-full rounded-full border border-slate-200 bg-white px-4 text-sm font-normal text-slate-950 focus:border-violet-300/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
          >
            <option value="recommended">Recommended</option>
            <option value="distance">Nearest</option>
            <option value="newest">Newest</option>
          </select>
        </label>

        <div className="inline-flex h-11 rounded-full border border-slate-200 bg-slate-100 p-1">
          {[
            { key: "list", label: "List" },
            { key: "map", label: "Map" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setMobileView(item.key)}
              className={`rounded-full px-4 text-sm font-semibold transition ${
                mobileView === item.key
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-600 hover:text-slate-950"
              }`}
              aria-pressed={mobileView === item.key}
              data-testid={`nearby-toggle-${item.key}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  if (loadingUser && !user) {
    return (
      <div className="relative min-h-screen px-6 pt-10 text-slate-950">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-0 bg-[#f8f5ef]" />
        </div>
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-violet-600" />
        </div>
      </div>
    );
  }

  return (
    <section
      className={`relative min-h-screen w-full pb-6 pt-0 text-slate-950 ${styles.nearbyPage}`}
      data-testid="nearby-page-root"
    >
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#f8f5ef]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.12),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,245,239,0.98))]" />
      </div>

      <div className="relative z-10 w-full px-5 sm:px-6 md:px-8 lg:px-12">
        {showLocationEmpty ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            Explore local businesses near Long Beach while your location finishes loading.
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
                onToggleSaveShop={onToggleSaveShop}
                savedBusinessIds={savedBusinessIds}
                savingBusinessIds={savingBusinessIds}
                showSaveControls={showSaveControls}
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
