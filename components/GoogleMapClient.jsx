"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import useBusinessProfileAccessGate from "@/components/auth/useBusinessProfileAccessGate";
import { markImageFailed } from "@/lib/safeImage";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { getCustomerBusinessUrl } from "@/lib/ids/publicRefs";
import {
  getBusinessTypePlaceholder,
  resolveBusinessImageSrc,
} from "@/lib/placeholders/businessPlaceholders";

// helper: compute distance in km
function haversine(lat1, lon1, lat2, lon2) {
  function toRad(x) {
    return (x * Math.PI) / 180;
  }
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const ALLOWED_RETAIL_TYPES = new Set([
  "florist",
  "bakery",
  "book_store",
  "clothing_store",
  "convenience_store",
  "department_store",
  "electronics_store",
  "furniture_store",
  "home_goods_store",
  "hardware_store",
  "jewelry_store",
  "liquor_store",
  "pet_store",
  "pharmacy",
  "shoe_store",
  "shopping_mall",
  "store",
  "supermarket",
  "bicycle_store",
  "cell_phone_store",
]);

const formatCategory = (type) => {
  if (!type) return "Uncategorized";
  const withSpaces = type.replace(/_/g, " ");
  return withSpaces
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

// Default to Long Beach to avoid centering in the ocean if geolocation or data is missing
const FALLBACK_CENTER = { lat: 33.7701, lng: -118.1937 };
const GEOCODE_TIMEOUT_MS = 1200;
const MAX_GEOCODES_PER_SESSION = 20;
const REQUEST_KEY_PRECISION = 4;
const REQUEST_DEDUP_MS = 4000;
const PLACES_DISABLED =
  process.env.NEXT_PUBLIC_DISABLE_PLACES === "true" ||
  process.env.NEXT_PUBLIC_DISABLE_PLACES === "1";
const PLACES_MIN_INTERVAL_MS =
  Number.parseInt(process.env.NEXT_PUBLIC_PLACES_MIN_INTERVAL_MS || "", 10) ||
  15000;
const PLACES_MAX_RESULTS =
  Number.parseInt(process.env.NEXT_PUBLIC_PLACES_MAX_RESULTS || "", 10) || 5;

const LAST_CENTER_KEY = "yb_last_center";

function createRecenterControl({ onRecenter, testId }) {
  return {
    onAdd() {
      const container = document.createElement("div");
      container.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
      container.style.marginTop = "8px";
      container.style.marginRight = "10px";

      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", "Recenter to my location");
      button.setAttribute("title", "Recenter to my location");
      button.setAttribute("data-testid", testId || "recenter-map");
      button.style.width = "32px";
      button.style.height = "32px";
      button.style.display = "flex";
      button.style.alignItems = "center";
      button.style.justifyContent = "center";
      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
          <path d="M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z" />
          <path d="M12 3v2.5M12 18.5V21M21 12h-2.5M5.5 12H3" stroke-linecap="round" />
          <circle cx="12" cy="12" r="8.25" stroke-opacity="0.55" />
        </svg>
      `;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onRecenter?.();
      });

      container.appendChild(button);
      this._container = container;
      return container;
    },
    onRemove() {
      this._container?.remove();
      this._container = null;
    },
  };
}

export default function GoogleMapClient({
  radiusKm = 25,
  containerClassName = "w-full max-w-6xl mx-auto mt-12",
  cardClassName = "bg-white/5 border border-white/10 rounded-2xl p-4 text-white",
  mapClassName = "h-80 rounded-lg overflow-hidden",
  title = "Businesses Near You",
  showBusinessErrors = true,
  enableCategoryFilter = false,
  enableSearch = false,
  disableGooglePlaces = false, // hard kill-switch to never call Places lookup
  preferUserCenter = false, // if true, keep map near user/fallback even when prefilled data is far
  prefilledBusinesses = null, // optional array of businesses to render without fetching
  onBusinessesChange,
  onControlsReady,
  externalSearchTerm,
  externalSearchTrigger,
  preferredCenter = null,
  activeBusinessId = null,
  hoveredBusinessId = null,
  selectedBusinessId = null,
  selectedBusiness = null,
  onMarkerHover,
  onMarkerLeave,
  onMarkerClick,
  showRecenterControl = false,
  recenterButtonTestId = "recenter-map",
  markerClickBehavior = "navigate",
}) {
  const gateBusinessProfileAccess = useBusinessProfileAccessGate();
  // DEBUG_CLICK_DIAG
  const clickDiagEnabled = process.env.NEXT_PUBLIC_CLICK_DIAG === "1";
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const mapErrorLoggedRef = useRef(false);
  const businessMarkersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const searchMarkerRef = useRef(null);
  const lastFetchRef = useRef({ lat: null, lng: null, zoom: null });
  const fetchInFlightRef = useRef(false);
  const loadAndPlaceMarkersRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchMessage, setSearchMessage] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [mapReady, setMapReady] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoriesWithCounts, setCategoriesWithCounts] = useState([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const geocodeCacheRef = useRef(new Map());
  const curatedBusinessesRef = useRef([]);
  const curatedFetchPromiseRef = useRef(null);
  const activePopupRef = useRef(null);
  const pendingViewRef = useRef(null);
  const suppressNextMoveRef = useRef(false);
  const markerIndexRef = useRef(new Map());
  const userCenterRef = useRef(null);
  const geocodeBudgetRef = useRef(MAX_GEOCODES_PER_SESSION);
  const lastFetchKeyRef = useRef(null);
  const lastFetchAtRef = useRef(0);
  const placesEnabledRef = useRef(!disableGooglePlaces);
  const persistedCenterRef = useRef(null);
  const prefilledBusinessesRef = useRef(prefilledBusinesses || []);
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (!Array.isArray(prefilledBusinesses)) {
      prefilledBusinessesRef.current = [];
      return;
    }
    const normalizeNumber = (value) => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    prefilledBusinessesRef.current = prefilledBusinesses.map((biz) => {
      if (!biz) return biz;
      if (biz.coords && Number.isFinite(biz.coords.lat) && Number.isFinite(biz.coords.lng)) {
        return biz;
      }
      const lat = normalizeNumber(biz.lat ?? biz.latitude);
      const lng = normalizeNumber(biz.lng ?? biz.longitude);
      if (typeof lat === "number" && typeof lng === "number") {
        return { ...biz, coords: { lat, lng } };
      }
      return biz;
    });
  }, [prefilledBusinesses]);

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_CENTER_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.lat === "number" &&
        typeof parsed.lng === "number" &&
        Number.isFinite(parsed.lat) &&
        Number.isFinite(parsed.lng)
      ) {
        persistedCenterRef.current = parsed;
      }
    } catch (_) {
      /* ignore */
    }
  }, []);

  const computeVisibleRadiusMeters = (fallbackMeters) => {
    const map = mapInstanceRef.current;
    if (!map) return Math.max(100, fallbackMeters || 1000);
    const bounds = map.getBounds();
    const center = map.getCenter();
    if (!bounds || !center) return Math.max(100, fallbackMeters || 1000);
    const ne = bounds.getNorthEast();
    const diagKm = haversine(center.lat, center.lng, ne.lat, ne.lng);
    return Math.max(100, diagKm * 1000);
  };

  const getPrefilledCenter = () => {
    const list = prefilledBusinessesRef.current || [];
    const withCoords = list.find(
      (biz) =>
        biz?.coords &&
        typeof biz.coords.lat === "number" &&
        typeof biz.coords.lng === "number" &&
        !(biz.coords.lat === 0 && biz.coords.lng === 0)
    );
    return withCoords?.coords || null;
  };

  const getFirstPrefilledCoord = () => {
    const list = prefilledBusinessesRef.current || [];
    const found = list.find(
      (biz) =>
        biz?.coords &&
        typeof biz.coords.lat === "number" &&
        typeof biz.coords.lng === "number" &&
        !(biz.coords.lat === 0 && biz.coords.lng === 0)
    );
    return found?.coords || null;
  };

  const normalizeCategoryKey = (value) =>
    (value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const enforceCenter = (center) => {
    if (
      !center ||
      typeof center.lat !== "number" ||
      typeof center.lng !== "number" ||
      !Number.isFinite(center.lat) ||
      !Number.isFinite(center.lng) ||
      (center.lat === 0 && center.lng === 0)
    ) {
      return FALLBACK_CENTER;
    }
    return center;
  };

  const parseCenter = (candidate) => {
    if (!candidate || typeof candidate !== "object") return null;
    const latRaw = candidate.lat;
    const lngRaw = candidate.lng;
    const lat = typeof latRaw === "number" ? latRaw : Number.parseFloat(latRaw);
    const lng = typeof lngRaw === "number" ? lngRaw : Number.parseFloat(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
    return { lat, lng };
  };

  const getSafeCenter = (lat, lng) => {
    const isFiniteNum = (val) => typeof val === "number" && Number.isFinite(val);
    if (isFiniteNum(lat) && isFiniteNum(lng) && !(lat === 0 && lng === 0)) {
      return { lat, lng };
    }
    if (userCenterRef.current) return userCenterRef.current;
    const prefilled = getPrefilledCenter();
    if (prefilled) return prefilled;
    return FALLBACK_CENTER;
  };

  const getDefaultCenter = () => {
    if (persistedCenterRef.current) return enforceCenter(persistedCenterRef.current);
    return getSafeCenter(userCenterRef.current?.lat, userCenterRef.current?.lng);
  };

  const detachMarker = (marker) => {
    if (!marker) return;
    if (typeof marker.remove === "function") {
      marker.remove();
    } else if ("map" in marker) {
      marker.map = null;
    }
  };

  const updateMarkerVisualState = useCallback(
    (businessId, element) => {
      if (!element) return;
      const normalizedId = businessId == null ? null : String(businessId);
      const activeId =
        hoveredBusinessId != null
          ? String(hoveredBusinessId)
          : activeBusinessId == null
            ? null
            : String(activeBusinessId);
      const selectedId = selectedBusinessId == null ? null : String(selectedBusinessId);
      element.classList.toggle("yb-marker-active", normalizedId === activeId);
      element.classList.toggle("yb-marker-selected", normalizedId === selectedId);
    },
    [activeBusinessId, hoveredBusinessId, selectedBusinessId]
  );

  const clearBusinessMarkers = () => {
    markerIndexRef.current.forEach((rec) => detachMarker(rec.marker));
    businessMarkersRef.current.forEach(detachMarker);
    businessMarkersRef.current = [];
    markerIndexRef.current.clear();
  };

  const geocodeWithTimeout = async (address) => {
    return geocodeAddress(address, GEOCODE_TIMEOUT_MS);
  };

  const geocodeAddress = async (address, timeoutMs = GEOCODE_TIMEOUT_MS) => {
    if (!address) return null;
    const key = address.trim().toLowerCase();
    if (geocodeCacheRef.current.has(key)) {
      return geocodeCacheRef.current.get(key);
    }

    try {
      if (geocodeBudgetRef.current <= 0) {
        geocodeCacheRef.current.set(key, null);
        return null;
      }
      geocodeBudgetRef.current -= 1;

      const res = await fetchWithTimeout("/api/geocode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ address }),
        timeoutMs,
      });

      if (!res.ok) {
        throw new Error(`geocode failed ${res.status}`);
      }

      const data = await res.json();
      if (typeof data?.lat === "number" && typeof data?.lng === "number") {
        const coords = { lat: data.lat, lng: data.lng };
        geocodeCacheRef.current.set(key, coords);
        return coords;
      }
    } catch (err) {
      console.warn("Geocode failed for", address, err);
    }

    geocodeCacheRef.current.set(key, null);
    return null;
  };

  const loadCuratedBusinesses = async () => {
    if (curatedFetchPromiseRef.current) return curatedFetchPromiseRef.current;
    curatedFetchPromiseRef.current = (async () => {
      try {
        const res = await fetch("/api/public-businesses");
        const payload = await res.json();
        if (!res.ok) {
          console.warn("Curated businesses fetch failed", payload?.error || payload);
          return [];
        }
        const rows = Array.isArray(payload?.businesses) ? payload.businesses : [];

        const filtered = rows.filter((row) => {
          const hasAddr = Boolean(row?.address);
          const hasCoords =
            typeof row?.latitude === "number" ||
            typeof row?.longitude === "number" ||
            typeof row?.lat === "number" ||
            typeof row?.lng === "number" ||
            (typeof row?.latitude === "string" && row.latitude.trim() !== "") ||
            (typeof row?.longitude === "string" && row.longitude.trim() !== "");
          return hasAddr || hasCoords;
        });

        const mapped = (
          await Promise.allSettled(
            filtered.map(async (row) => {
              const displayAddress = row.city
                ? `${row.address || ""}${row.address ? ", " : ""}${row.city}`
                : row.address;

              const parseNum = (val) => {
                if (typeof val === "number" && !Number.isNaN(val)) return val;
                const parsed = parseFloat(val);
                return Number.isFinite(parsed) ? parsed : null;
              };

              const latCandidate = parseNum(row.latitude ?? row.lat);
              const lngCandidate = parseNum(row.longitude ?? row.lng);
              const hasCoords =
                typeof latCandidate === "number" && typeof lngCandidate === "number";

              const coords =
                hasCoords && latCandidate !== null && lngCandidate !== null
                  ? { lat: latCandidate, lng: lngCandidate }
                  : await geocodeWithTimeout(displayAddress);
              if (!coords) return null;

              const name =
                row.business_name || row.name || row.full_name || "Local Business";
              return {
                id: row.id,
                public_id: row.public_id || null,
                name,
                address: displayAddress,
                coords,
                categoryLabel: row.category
                  ? formatCategory(row.category.replace(/\s+/g, "_"))
                  : "Local Business",
                source: "supabase_users",
                imageUrl: row.profile_photo_url || null,
                description: row.description || "",
                website: row.website || "",
              };
            })
          )
        )
          .map((res) => (res.status === "fulfilled" ? res.value : null))
          .filter(Boolean);

        // Deduplicate by ID to avoid double rendering if the same business exists in both tables
        const deduped = [];
        const seen = new Set();
        for (const biz of mapped) {
          const key = biz.id || biz.name;
          if (key && seen.has(key)) continue;
          if (key) seen.add(key);
          deduped.push(biz);
        }

        curatedBusinessesRef.current = deduped;
        return deduped;
      } catch (err) {
        console.error("Failed to fetch curated businesses", err);
        curatedBusinessesRef.current = [];
        return [];
      }
    })();

    return curatedFetchPromiseRef.current;
  };

  const createPopupContent = (biz) => {
    const safeText = (value) =>
      typeof value === "string"
        ? value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        : "";

    const wrapper = document.createElement("div");
    wrapper.dataset.testid = "map-popup-card";
    wrapper.style.color = "#0f172a";
    wrapper.style.maxWidth = "240px";
    wrapper.style.cursor = biz?.id ? "pointer" : "default";
    if (biz?.id) {
      wrapper.tabIndex = 0;
      wrapper.setAttribute("role", "link");
      wrapper.setAttribute("aria-label", `View ${safeText(biz.name || "business")} profile`);
      wrapper.addEventListener("click", (event) => {
        if (event.target?.closest?.("a")) return;
        const url = getCustomerBusinessUrl(biz);
        if (!gateBusinessProfileAccess(event, url)) return;
        window.location.assign(url);
      });
      wrapper.addEventListener("keydown", (event) => {
        if (event.target?.closest?.("a")) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          const url = getCustomerBusinessUrl(biz);
          if (!gateBusinessProfileAccess(event, url)) return;
          window.location.assign(url);
        }
      });
    }
    const imgContainer = document.createElement("div");
    const placeholderSrc = getBusinessTypePlaceholder(
      biz.business_type || biz.categoryLabel || biz.category || null
    );
    const resolvedSrc = resolveBusinessImageSrc({
      imageUrl: biz.imageUrl || null,
      businessType: biz.business_type,
      legacyCategory: biz.categoryLabel || biz.category || null,
    });
    if (resolvedSrc) {
      const img = document.createElement("img");
      img.src = resolvedSrc;
      img.alt = safeText(biz.name || "");
      img.style.width = "100%";
      img.style.maxHeight = "120px";
      img.style.objectFit = "cover";
      img.style.borderRadius = "10px";
      img.style.border = "1px solid #e5e7eb";
      img.style.marginBottom = "8px";
      img.onerror = () => {
        if (img.src === placeholderSrc) return;
        markImageFailed(img.src || biz.imageUrl);
        img.src = placeholderSrc;
      };
      imgContainer.appendChild(img);
    }

    if (imgContainer.childElementCount) {
      wrapper.appendChild(imgContainer);
    }

    const title = document.createElement("strong");
    title.style.fontSize = "14px";
    title.textContent = safeText(biz.name || "Local Business");
    wrapper.appendChild(title);

    const category = document.createElement("div");
    category.style.fontSize = "12px";
    category.style.marginTop = "2px";
    category.textContent = `${safeText(biz.categoryLabel || "Local Business")}${
      biz.source === "supabase_users" ? " · YourBarrio" : ""
    }`;
    wrapper.appendChild(category);

    if (biz.address) {
      const address = document.createElement("div");
      address.style.fontSize = "12px";
      address.style.marginTop = "4px";
      address.style.color = "#334155";
      address.textContent = safeText(biz.address);
      wrapper.appendChild(address);
    }

    if (biz.description) {
      const desc = document.createElement("div");
      desc.style.fontSize = "12px";
      desc.style.marginTop = "6px";
      desc.style.color = "#475569";
      desc.dataset.testid = "map-popup-description";
      desc.style.display = "-webkit-box";
      desc.style.webkitLineClamp = "3";
      desc.style.webkitBoxOrient = "vertical";
      desc.style.overflow = "hidden";
      desc.style.textOverflow = "ellipsis";
      desc.textContent = safeText(biz.description);
      wrapper.appendChild(desc);
    }

    if (biz.website && /^https?:\/\//i.test(biz.website)) {
      const website = document.createElement("div");
      website.style.fontSize = "12px";
      website.style.marginTop = "6px";
      const link = document.createElement("a");
      link.href = biz.website;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Website";
      website.appendChild(link);
      wrapper.appendChild(website);
    }

    return wrapper;
  };

  const renderMarkers = (list, category) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const filtered =
      category === "All"
        ? list
        : list.filter((biz) => biz.categoryLabel === category);

    const keep = new Set();

    filtered.forEach((biz) => {
      const key = biz.id || biz.name;
      if (!key || !biz.coords) return;
      keep.add(key);
      if (!biz.coords) return;

      const isCurated = biz.source === "supabase_users";
      const existing = markerIndexRef.current.get(key);
      if (existing) {
        if (
          existing.coords?.lat !== biz.coords.lat ||
          existing.coords?.lng !== biz.coords.lng
        ) {
          existing.marker?.setLngLat([biz.coords.lng, biz.coords.lat]);
          existing.coords = biz.coords;
        }
        if (existing.contentUpdater) {
          existing.contentUpdater(biz);
        }
        updateMarkerVisualState(key, existing.element);
        return;
      }

      const wrapper = document.createElement("div");
      wrapper.className = `yb-marker${isCurated ? " yb-marker-curated" : ""}`;
      wrapper.setAttribute("tabindex", "0");
      wrapper.dataset.businessId = String(key);
      const localWrap = document.createElement("div");
      localWrap.className = "yb-marker-local";
      const icon = document.createElement("div");
      icon.className = `yb-marker-icon${isCurated ? " yb-marker-icon-green" : ""}`;
      const label = document.createElement("div");
      label.className = "yb-marker-label";
      label.textContent = biz.name;
      localWrap.appendChild(icon);
      localWrap.appendChild(label);
      wrapper.appendChild(localWrap);

      const popupContent = createPopupContent(biz);
      const popup = new mapboxgl.Popup({ offset: 16, closeButton: true }).setDOMContent(popupContent);
      popup.on("open", () => {
        if (activePopupRef.current && activePopupRef.current !== popup) {
          activePopupRef.current.remove();
        }
        activePopupRef.current = popup;
      });

      const marker = new mapboxgl.Marker({ element: wrapper, anchor: "bottom" })
        .setLngLat([biz.coords.lng, biz.coords.lat])
        .setPopup(popup)
        .addTo(map);

      const updateContent = (nextBiz) => {
        const newContent = createPopupContent(nextBiz);
        popup.setDOMContent(newContent);
      };

      const openBusinessProfile = (event) => {
        if (markerClickBehavior === "select") {
          popup.addTo(map);
          onMarkerClick?.(key);
          return;
        }
        if (biz?.id) {
          const url = getCustomerBusinessUrl(biz);
          if (!gateBusinessProfileAccess(event, url)) return;
          if (event?.metaKey || event?.ctrlKey) {
            window.open(url, "_blank", "noopener");
          } else {
            window.location.assign(url);
          }
          return;
        }
        popup.addTo(map);
      };

      wrapper.addEventListener("click", openBusinessProfile);
      wrapper.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openBusinessProfile(event);
        }
      });
      wrapper.addEventListener("mouseenter", () => onMarkerHover?.(key));
      wrapper.addEventListener("mouseleave", () => onMarkerLeave?.());
      wrapper.addEventListener("focus", () => onMarkerHover?.(key));
      wrapper.addEventListener("blur", () => onMarkerLeave?.());

      updateMarkerVisualState(key, wrapper);

      businessMarkersRef.current.push(marker);
      markerIndexRef.current.set(key, {
        marker,
        popup,
        coords: biz.coords,
        contentUpdater: updateContent,
        element: wrapper,
      });
    });

    markerIndexRef.current.forEach((rec, key) => {
      if (keep.has(key)) return;
      detachMarker(rec.marker);
      markerIndexRef.current.delete(key);
    });
  };

  const fetchPlacesNew = async ({ lat, lng, radiusMeters, query }) => {
    if (PLACES_DISABLED || disableGooglePlaces || !placesEnabledRef.current) return [];
    const radius = radiusMeters ?? Math.max(100, radiusKm * 1000);
    const res = await fetch("/api/places", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "nearby",
        lat,
        lng,
        radiusMeters: radius,
        maxResultCount: Math.max(1, Math.min(PLACES_MAX_RESULTS, 20)),
        query,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Places (new) request failed: ${res.status} ${txt}`);
    }
    const data = await res.json();
    if (data.disabled) return [];
    return data.places || [];
  };

  const shouldRefetch = (lat, lng, zoom) => {
    if (lastFetchRef.current.lat === null) return true;
    const dist = haversine(lat, lng, lastFetchRef.current.lat, lastFetchRef.current.lng);
    if (dist > 0.5) return true; // re-fetch if moved >500m
    if (zoom !== lastFetchRef.current.zoom) return true;
    return false;
  };

  const loadAndPlaceMarkers = async (
    centerLat,
    centerLng,
    zoomLevel,
    radiusOverrideMeters,
    includedTypesOverride
  ) => {
    if (!isMountedRef.current) return;
    if (fetchInFlightRef.current) return;

    const map = mapInstanceRef.current;
    if (!map) return;

    const safeCenter = enforceCenter(getSafeCenter(centerLat, centerLng));
    suppressNextMoveRef.current = true;

    const radiusMeters =
      radiusOverrideMeters || computeVisibleRadiusMeters(radiusKm * 1000);

    const requestKey = [
      typeof safeCenter.lat === "number" ? safeCenter.lat.toFixed(REQUEST_KEY_PRECISION) : "",
      typeof safeCenter.lng === "number" ? safeCenter.lng.toFixed(REQUEST_KEY_PRECISION) : "",
      Math.round(radiusMeters || 0),
      zoomLevel ?? map?.getZoom?.() ?? "",
      (includedTypesOverride || []).slice().sort().join(","),
    ].join("|");
    const now = Date.now();
    const dedupMs = Math.max(REQUEST_DEDUP_MS, PLACES_MIN_INTERVAL_MS);
    if (
      requestKey &&
      requestKey === lastFetchKeyRef.current &&
      now - lastFetchAtRef.current < dedupMs
    ) {
      setLoading(false);
      setRefreshNeeded(false);
      pendingViewRef.current = null;
      return;
    }
    lastFetchKeyRef.current = requestKey;
    lastFetchAtRef.current = now;

    // Keep existing markers on screen while loading new data to avoid rebuild loops
    setLoading(true);
    fetchInFlightRef.current = true;
    lastFetchRef.current = {
      lat: safeCenter.lat,
      lng: safeCenter.lng,
      zoom: zoomLevel ?? map?.getZoom?.(),
    };

    try {
      map.setCenter([safeCenter.lng, safeCenter.lat]);
      if (map.getZoom() < 12) map.setZoom(13);

      const currentPrefilled = prefilledBusinessesRef.current || [];
      if (Array.isArray(currentPrefilled) && currentPrefilled.length) {
        const localList = currentPrefilled.slice();
        const withCoords = localList.filter(
          (biz) =>
            biz?.coords &&
            typeof biz.coords.lat === "number" &&
            typeof biz.coords.lng === "number" &&
            !(biz.coords.lat === 0 && biz.coords.lng === 0)
        );
        if (map && withCoords.length) {
          const userCenter = userCenterRef.current;
          try {
            const bounds = new mapboxgl.LngLatBounds();
            withCoords.forEach((biz) => bounds.extend([biz.coords.lng, biz.coords.lat]));
            let centerToUse = null;
            if (userCenter) {
              const maxDistKm = Math.min(Math.max(radiusKm * 2, 30), 200);
              const minDist = withCoords.reduce((min, biz) => {
                const d = haversine(
                  userCenter.lat,
                  userCenter.lng,
                  biz.coords.lat,
                  biz.coords.lng
                );
                return Math.min(min, d);
              }, Infinity);
              centerToUse = preferUserCenter || minDist <= maxDistKm ? userCenter : null;
            }
            if (!centerToUse && preferUserCenter) {
              centerToUse = enforceCenter(getDefaultCenter());
            }
            if (centerToUse) {
              const enforced = enforceCenter(centerToUse);
              map.setCenter([enforced.lng, enforced.lat]);
              if (map.getZoom() < 13) map.setZoom(13);
            } else {
              map.fitBounds(bounds, { padding: 48, maxZoom: 15 });
            }
            suppressNextMoveRef.current = true;
          } catch (fitErr) {
            console.warn("Could not fit map to prefilled businesses", fitErr);
          }
        }
        setBusinesses(localList);
        const categoryCounts = localList.reduce((acc, biz) => {
          const key = biz.categoryLabel || biz.category || "Local Business";
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {});
        const uniqueCategories = Object.keys(categoryCounts).sort((a, b) => a.localeCompare(b));
        const categoriesList = uniqueCategories.map((cat) => ({
          name: cat,
          count: categoryCounts[cat] || 0,
        }));
        setCategories(uniqueCategories);
        setCategoriesWithCounts(categoriesList);
        renderMarkers(withCoords, activeCategory);

        const firstCoord = getFirstPrefilledCoord();
        const centerCandidate = enforceCenter(
          userCenterRef.current ||
            (centerLat && centerLng ? { lat: centerLat, lng: centerLng } : null) ||
            firstCoord
        );
        map.setCenter([centerCandidate.lng, centerCandidate.lat]);
        if (map.getZoom() < 13) map.setZoom(13);

        setLoading(false);
        setRefreshNeeded(false);
        pendingViewRef.current = null;
        return;
      }

      let places = [];
      try {
        const nearbyQuery =
          includedTypesOverride && includedTypesOverride.length
            ? includedTypesOverride[0].replace(/_/g, " ")
            : undefined;
        places = await fetchPlacesNew({
          lat: safeCenter.lat,
          lng: safeCenter.lng,
          radiusMeters,
          query: nearbyQuery,
        });
      } catch (errNew) {
        console.error("Places (new) fetch failed", errNew);
        if (showBusinessErrors) {
          setError("Nearby search is unavailable right now.");
        }
        places = [];
      }

      const includedTypeSet =
        includedTypesOverride && includedTypesOverride.length
          ? new Set(includedTypesOverride)
          : null;
      const filteredPlaces = includedTypeSet
        ? (places || []).filter((place) => {
            const types = Array.isArray(place?.types) ? place.types : [];
            const normalizedLabel = normalizeCategoryKey(place?.categoryLabel);
            if (normalizedLabel && includedTypeSet.has(normalizedLabel)) return true;
            return types.some((type) => includedTypeSet.has(type));
          })
        : places || [];

      const bounds = map?.getBounds ? map.getBounds() : null;
      const businessesWithCoords = [];
      for (const place of filteredPlaces || []) {
        const loc = place.location || place.geometry?.location || null;
        if (!loc) continue;
        const pts = {
          lat: typeof loc.lat === "function" ? loc.lat() : loc.lat ?? loc.latitude,
          lng: typeof loc.lng === "function" ? loc.lng() : loc.lng ?? loc.longitude,
        };
        if (bounds && !bounds.contains([pts.lng, pts.lat])) {
          continue;
        }
        const typeList = Array.isArray(place.types) ? place.types : [];
        const primaryType =
          typeList.find((t) => t && ALLOWED_RETAIL_TYPES.has(t)) || typeList[0];
        const categoryLabel = place.categoryLabel || formatCategory(primaryType || "Local");
        businessesWithCoords.push({
          id: place.place_id || place.id,
          name: place.name || place.displayName?.text || "Unnamed",
          address: place.vicinity || place.formatted_address || place.formattedAddress || "",
          coords: pts,
          categoryLabel,
          source: place.source || "mapbox",
          zoom: zoomLevel || map?.getZoom?.(),
          imageUrl: place.imageUrl || null,
        });
      }

      let curatedNearby = [];
      try {
        const curated = await loadCuratedBusinesses();
        curatedNearby = (curated || []).filter((biz) => biz?.coords);
      } catch (curatedErr) {
        console.warn("Curated business load failed", curatedErr);
      }

      const combinedBusinesses = [...curatedNearby, ...businessesWithCoords];
      const finalBusinesses = combinedBusinesses;

      if (PLACES_DISABLED || ((!places || places.length === 0) && curatedNearby.length)) {
        try {
          const anchorCenter = preferUserCenter
            ? enforceCenter(userCenterRef.current || getDefaultCenter())
            : null;

          if (anchorCenter) {
            map.setCenter([anchorCenter.lng, anchorCenter.lat]);
            if (map.getZoom() < 13) map.setZoom(13);
            suppressNextMoveRef.current = true;
          } else {
            const fitBounds = new mapboxgl.LngLatBounds();
            curatedNearby.forEach((biz) => fitBounds.extend([biz.coords.lng, biz.coords.lat]));
            if (!fitBounds.isEmpty()) {
              map.fitBounds(fitBounds, { padding: 48, maxZoom: 15 });
              suppressNextMoveRef.current = true;
            }
          }
        } catch (fitErr) {
          console.warn("Failed to fit map to curated businesses", fitErr);
        }
      }

      const categoryCounts = finalBusinesses.reduce((acc, biz) => {
        acc[biz.categoryLabel] = (acc[biz.categoryLabel] || 0) + 1;
        return acc;
      }, {});
      const uniqueCategories = Object.keys(categoryCounts).sort((a, b) => a.localeCompare(b));
      const categoriesList = uniqueCategories.map((cat) => ({
        name: cat,
        count: categoryCounts[cat] || 0,
      }));
      setBusinesses(finalBusinesses);
      setCategories(uniqueCategories);
      setCategoriesWithCounts(categoriesList);
      renderMarkers(finalBusinesses, activeCategory);
      if (preferUserCenter && map) {
        const anchorCenter = enforceCenter(
          userCenterRef.current ||
            getDefaultCenter()
        );
        map.setCenter([anchorCenter.lng, anchorCenter.lat]);
        if (map.getZoom() < 13) map.setZoom(13);
      }
      setLoading(false);
      setRefreshNeeded(false);
      pendingViewRef.current = null;
    } catch (err) {
      console.error("Map load failed", err);
      setError(err.message || "Failed to load map data.");
      setLoading(false);
      setRefreshNeeded(false);
      pendingViewRef.current = null;
    } finally {
      fetchInFlightRef.current = false;
    }
  };

  const handleRefreshClick = () => {
    const map = mapInstanceRef.current;
    if (!map || !loadAndPlaceMarkersRef.current) return;
    const preferred = userCenterRef.current || getFirstPrefilledCoord();
    const center = preferred || map.getCenter();
    const safe = enforceCenter(
      preferred || getSafeCenter(center?.lat ?? center?.lat?.(), center?.lng ?? center?.lng?.())
    );
    map.setCenter([safe.lng, safe.lat]);
    const zoom = map.getZoom();
    const radiusMeters = computeVisibleRadiusMeters(radiusKm * 1000);
    suppressNextMoveRef.current = true;
    setRefreshNeeded(false);
    pendingViewRef.current = null;
    loadAndPlaceMarkersRef.current(safe.lat, safe.lng, zoom, radiusMeters);
  };

  const handleRecenterClick = () => {
    const map = mapInstanceRef.current;
    if (!map) return false;
    const target = userCenterRef.current;
    if (!target) {
      setSearchError("Your location is unavailable right now.");
      setSearchMessage(null);
      return false;
    }
    setSearchError(null);
    setSearchMessage(null);
    suppressNextMoveRef.current = true;
    map.flyTo({ center: [target.lng, target.lat], zoom: Math.max(map.getZoom(), 13) });
    return true;
  };

  const performSearch = async (term) => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (!term?.trim()) {
      if (!loadAndPlaceMarkersRef.current) return;
      const center = map.getCenter();
      if (!center) return;
      setSearchLoading(true);
      setSearchError(null);
      setSearchMessage(null);
      detachMarker(searchMarkerRef.current);
      try {
        await loadAndPlaceMarkersRef.current(
          center.lat,
          center.lng,
          map.getZoom(),
          computeVisibleRadiusMeters(radiusKm * 1000)
        );
        setActiveCategory("All");
        setSearchMessage("Showing all businesses nearby.");
      } catch (err) {
        console.error("Refresh search failed", err);
        setSearchError("Could not refresh nearby businesses.");
      } finally {
        setSearchLoading(false);
      }
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    setSearchMessage(null);
    detachMarker(searchMarkerRef.current);
    try {
      if (PLACES_DISABLED || disableGooglePlaces) {
        setSearchError("Search is disabled right now.");
        setSearchLoading(false);
        return;
      }
      if (!placesEnabledRef.current) {
        setSearchError("Nearby search is disabled.");
        setSearchLoading(false);
        return;
      }
      const center = map.getCenter();
      const radiusMeters = computeVisibleRadiusMeters(radiusKm * 1000);
      const searchTypeKey = term.trim().toLowerCase().replace(/\s+/g, "_");
      const limitedTypes = ALLOWED_RETAIL_TYPES.has(searchTypeKey) ? [searchTypeKey] : undefined;

      const res = await fetch("/api/places", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "text",
          textQuery: term.trim(),
          locationBias: {
            lat: center?.lat,
            lng: center?.lng,
            radiusMeters,
          },
          maxResultCount: 5,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Search failed: ${res.status} ${txt}`);
      }
      const data = await res.json();
      const place = data.places?.[0];
      if (!place?.location) {
        setSearchMessage("No matching place found nearby.");
        setSearchLoading(false);
        return;
      }

      const { latitude, longitude } = place.location;
      const target = { lat: latitude, lng: longitude };
      map.flyTo({ center: [target.lng, target.lat], zoom: Math.max(map.getZoom(), 15) });

      const markerContent = document.createElement("div");
      markerContent.className = "yb-marker";
      const inner = document.createElement("div");
      inner.className = "yb-marker-local";
      const icon = document.createElement("div");
      icon.className = "yb-marker-icon";
      const label = document.createElement("div");
      label.className = "yb-marker-label";
      label.textContent = place.displayName?.text || "Selected";
      inner.appendChild(icon);
      inner.appendChild(label);
      markerContent.appendChild(inner);

      detachMarker(searchMarkerRef.current);
      searchMarkerRef.current = new mapboxgl.Marker({ element: markerContent, anchor: "bottom" })
        .setLngLat([target.lng, target.lat])
        .addTo(map);

      await loadAndPlaceMarkersRef.current?.(
        latitude,
        longitude,
        map.getZoom(),
        computeVisibleRadiusMeters(radiusKm * 1000),
        limitedTypes
      );
      if (limitedTypes?.length) {
        const label = formatCategory(limitedTypes[0]);
        setActiveCategory(label);
      }
      setSearchMessage(place.displayName?.text || "Moved to result");
    } catch (err) {
      console.error(err);
      setSearchError(err.message || "Search failed");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    await performSearch(searchTerm);
  };

  const activatePlaces = () => {
    if (PLACES_DISABLED || disableGooglePlaces) return;
    placesEnabledRef.current = true;
    lastFetchKeyRef.current = null;
    lastFetchAtRef.current = 0;
  };

  const enablePlaces = async () => {
    if (PLACES_DISABLED || disableGooglePlaces) return;
    activatePlaces();
    const map = mapInstanceRef.current;
    if (!map || !loadAndPlaceMarkersRef.current) return;
    const center = map.getCenter();
    if (!center) return;
    suppressNextMoveRef.current = true;
    await loadAndPlaceMarkersRef.current(
      center.lat,
      center.lng,
      map.getZoom(),
      computeVisibleRadiusMeters(radiusKm * 1000)
    );
  };

  const disablePlaces = async () => {
    placesEnabledRef.current = false;
    lastFetchKeyRef.current = null;
    lastFetchAtRef.current = 0;
    const map = mapInstanceRef.current;
    if (!map || !loadAndPlaceMarkersRef.current) return;
    const center = map.getCenter();
    if (!center) return;
    suppressNextMoveRef.current = true;
    await loadAndPlaceMarkersRef.current(
      center.lat,
      center.lng,
      map.getZoom(),
      computeVisibleRadiusMeters(radiusKm * 1000)
    );
  };

  const focusBusiness = (biz) => {
    if (!biz) return;
    const map = mapInstanceRef.current;
    if (!map) return;
    const businessKey = biz?.id ?? biz?.public_id ?? biz?.name;
    const rec = markerIndexRef.current.get(businessKey);
    if (rec?.marker) {
      map.flyTo({
        center: [rec.coords.lng, rec.coords.lat],
        zoom: Math.max(map.getZoom(), 15),
      });
      if (activePopupRef.current && activePopupRef.current !== rec.popup) {
        activePopupRef.current.remove();
      }
      if (rec.popup) {
        rec.popup.addTo(map);
        activePopupRef.current = rec.popup;
      }
    } else if (biz.coords) {
      map.flyTo({
        center: [biz.coords.lng, biz.coords.lat],
        zoom: Math.max(map.getZoom(), 15),
      });
    }
  };

  const focusBusinessById = (businessId) => {
    if (!businessId) return;
    const rec = markerIndexRef.current.get(businessId);
    const map = mapInstanceRef.current;
    if (!rec || !map) return;
    map.flyTo({
      center: [rec.coords.lng, rec.coords.lat],
      zoom: Math.max(map.getZoom(), 15),
    });
    if (activePopupRef.current && activePopupRef.current !== rec.popup) {
      activePopupRef.current.remove();
    }
    if (rec.popup) {
      rec.popup.addTo(map);
      activePopupRef.current = rec.popup;
    }
  };

  useEffect(() => {
    let map;
    let moveEndHandler;

    if (mapInstanceRef.current) {
      return undefined;
    }

    if (!mapRef.current) {
      setError("Map container missing.");
      setLoading(false);
      return undefined;
    }

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      setError("Mapbox access token missing. Set NEXT_PUBLIC_MAPBOX_TOKEN.");
      setLoading(false);
      return undefined;
    }
    mapboxgl.accessToken = token;

    if (!mapboxgl.supported({ failIfMajorPerformanceCaveat: true })) {
      setError("Interactive map is not supported on this device. Showing a fallback view instead.");
      setLoading(false);
      return undefined;
    }

    try {
      const initialCenter = getDefaultCenter();
      map = new mapboxgl.Map({
        container: mapRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [initialCenter.lng, initialCenter.lat],
        zoom: 13,
        cooperativeGestures: false,
        dragPan: true,
        dragRotate: false,
        scrollZoom: true,
        touchZoomRotate: true,
        interactive: true,
        attributionControl: false,
        pitchWithRotate: false,
      });
    } catch (err) {
      console.error("Mapbox failed to initialize", err);
      setError("Interactive map failed to load on this device.");
      setLoading(false);
      return undefined;
    }

    mapInstanceRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    if (showRecenterControl) {
      map.addControl(
        createRecenterControl({
          onRecenter: handleRecenterClick,
          testId: recenterButtonTestId,
        }),
        "top-right"
      );
    }
    const handleLoaded = () => setLoading(false);
    const handleMapError = (event) => {
      const err = event?.error || event;
      if (!mapErrorLoggedRef.current) {
        mapErrorLoggedRef.current = true;
        console.error("Mapbox runtime error", err);
      }
      setError((prev) => prev || "Map unavailable right now.");
      setLoading(false);
    };
    map.on("load", handleLoaded);
    map.on("error", handleMapError);

    const placeUserMarker = (centerLat, centerLng) => {
      detachMarker(userMarkerRef.current);
      const userEl = document.createElement("div");
      userEl.className = "yb-user-marker";
      userMarkerRef.current = new mapboxgl.Marker({ element: userEl })
        .setLngLat([centerLng, centerLat])
        .addTo(map);
    };

    const startWithCenter = (lat, lng) => {
      map.setCenter([lng, lat]);
      map.setZoom(13);
      loadAndPlaceMarkersRef.current?.(lat, lng, map.getZoom(), computeVisibleRadiusMeters(radiusKm * 1000));
    };

    const onReady = () => {
      map.resize();
      loadAndPlaceMarkersRef.current = loadAndPlaceMarkers;
      onControlsReady?.({
        search: performSearch,
        focusBusiness,
        focusBusinessById,
        resize: () => {
          try {
            map.resize();
          } catch {
            /* ignore transient resize errors */
          }
        },
        recenterToUser: handleRecenterClick,
        enablePlaces,
        disablePlaces,
        placesEnabled: () => placesEnabledRef.current,
        refresh: handleRefreshClick,
      });
      setMapReady(true);

      const primed = prefilledBusinessesRef.current || [];
      if (Array.isArray(primed) && primed.length && loadAndPlaceMarkersRef.current) {
        const first = getFirstPrefilledCoord() || getPrefilledCenter() || enforceCenter(getDefaultCenter());
        suppressNextMoveRef.current = true;
        loadAndPlaceMarkersRef.current(
          first.lat,
          first.lng,
          map.getZoom(),
          computeVisibleRadiusMeters(radiusKm * 1000)
        );
      }

      const preferred = parseCenter(preferredCenter);
      if (preferred) {
        userCenterRef.current = preferred;
        persistedCenterRef.current = preferred;
        try {
          localStorage.setItem(LAST_CENTER_KEY, JSON.stringify(preferred));
        } catch (_) {
          /* ignore */
        }
        placeUserMarker(preferred.lat, preferred.lng);
        startWithCenter(preferred.lat, preferred.lng);
      } else {
        const centerToUse = enforceCenter(getDefaultCenter());
        startWithCenter(centerToUse.lat, centerToUse.lng);
      }
    };

    if (map.loaded()) {
      onReady();
    } else {
      map.on("load", onReady);
    }

    moveEndHandler = () => {
      if (suppressNextMoveRef.current) {
        suppressNextMoveRef.current = false;
        return;
      }
      const center = map.getCenter();
      if (!center) return;
      const lat = center.lat;
      const lng = center.lng;
      const zoom = map.getZoom();
      if (!shouldRefetch(lat, lng, zoom)) return;
      pendingViewRef.current = { lat, lng, zoom };
      setRefreshNeeded(true);
    };

    map.on("moveend", moveEndHandler);
    map.on("click", () => {
      activePopupRef.current?.remove();
    });

    return () => {
      moveEndHandler && map.off("moveend", moveEndHandler);
      map.off("load", handleLoaded);
      map.off("error", handleMapError);
      map.remove();
      clearBusinessMarkers();
      detachMarker(userMarkerRef.current);
      detachMarker(searchMarkerRef.current);
      loadAndPlaceMarkersRef.current = null;
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusKm]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;
    const preferred = parseCenter(preferredCenter);
    if (!preferred) return;

    userCenterRef.current = preferred;
    persistedCenterRef.current = preferred;
    try {
      localStorage.setItem(LAST_CENTER_KEY, JSON.stringify(preferred));
    } catch (_) {
      /* ignore */
    }

    detachMarker(userMarkerRef.current);
    const userEl = document.createElement("div");
    userEl.className = "yb-user-marker";
    userMarkerRef.current = new mapboxgl.Marker({ element: userEl })
      .setLngLat([preferred.lng, preferred.lat])
      .addTo(map);

    if (selectedBusinessId != null || selectedBusiness) {
      return;
    }

    const center = map.getCenter();
    const isAlreadyCentered =
      center &&
      Math.abs(center.lat - preferred.lat) < 0.0001 &&
      Math.abs(center.lng - preferred.lng) < 0.0001;

    if (!isAlreadyCentered) {
      map.flyTo({
        center: [preferred.lng, preferred.lat],
        zoom: Math.max(map.getZoom(), 13),
        duration: 700,
      });
    }

    loadAndPlaceMarkersRef.current?.(
      preferred.lat,
      preferred.lng,
      map.getZoom(),
      computeVisibleRadiusMeters(radiusKm * 1000)
    );
  }, [preferredCenter, mapReady, radiusKm, selectedBusiness, selectedBusinessId]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady || !selectedBusiness) return;

    const latRaw = selectedBusiness.lat ?? selectedBusiness.latitude;
    const lngRaw = selectedBusiness.lng ?? selectedBusiness.longitude;
    const lat = typeof latRaw === "number" ? latRaw : Number.parseFloat(latRaw);
    const lng = typeof lngRaw === "number" ? lngRaw : Number.parseFloat(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    map.flyTo({
      center: [lng, lat],
      zoom: Math.max(map.getZoom(), 15),
      duration: 450,
    });

    window.requestAnimationFrame(() => {
      try {
        map.resize();
      } catch {
        /* ignore transient resize errors */
      }
      map.flyTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), 15),
        duration: 300,
      });
      const selectedKey =
        selectedBusiness.id ??
        selectedBusiness.public_id ??
        selectedBusinessId ??
        null;
      const rec = selectedKey == null ? null : markerIndexRef.current.get(selectedKey);
      if (rec?.popup) {
        rec.popup.addTo(map);
        activePopupRef.current = rec.popup;
      }
    });
  }, [mapReady, selectedBusiness, selectedBusinessId]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    renderMarkers(businesses, activeCategory);

    const map = mapInstanceRef.current;
    const center = map.getCenter();
    if (center) {
      const candidate = { lat: center.lat, lng: center.lng };
      if (Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng)) {
        persistedCenterRef.current = candidate;
        try {
          localStorage.setItem(LAST_CENTER_KEY, JSON.stringify(candidate));
        } catch (_) {
          /* ignore */
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, businesses, updateMarkerVisualState]);

  useEffect(() => {
    if (!selectedBusinessId) return;
    focusBusinessById(selectedBusinessId);
  }, [selectedBusinessId]);

  useEffect(() => {
    markerIndexRef.current.forEach((rec, key) => {
      updateMarkerVisualState(key, rec.element);
      if (
        selectedBusinessId != null &&
        String(selectedBusinessId) === String(key) &&
        rec.popup &&
        mapInstanceRef.current
      ) {
        rec.popup.addTo(mapInstanceRef.current);
        activePopupRef.current = rec.popup;
      }
    });
  }, [activeBusinessId, selectedBusinessId, updateMarkerVisualState]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const container = containerRef.current;
    if (!map || !container) return undefined;

    const triggerResize = () => {
      try {
        map.resize();
      } catch {
        /* ignore transient resize errors */
      }
    };

    const timerId = window.setTimeout(triggerResize, 80);
    window.addEventListener("resize", triggerResize);

    let observer;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => triggerResize());
      observer.observe(container);
    }

    return () => {
      window.clearTimeout(timerId);
      window.removeEventListener("resize", triggerResize);
      observer?.disconnect();
    };
  }, [mapReady]);

  useEffect(() => {
    if (typeof onBusinessesChange === "function") {
      onBusinessesChange(businesses);
    }
  }, [businesses, onBusinessesChange]);

  useEffect(() => {
    if (!externalSearchTrigger) return;
    performSearch(externalSearchTerm || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSearchTrigger]);

  useEffect(() => {
    if (!mapInstanceRef.current || !loadAndPlaceMarkersRef.current) return;
    if (!Array.isArray(prefilledBusinesses) || !prefilledBusinesses.length) return;
    if (!mapReady) return;

    // Force next load to run (bypass dedup) when prefilled set changes
    lastFetchKeyRef.current = null;
    lastFetchAtRef.current = 0;

    const preferred = userCenterRef.current || getFirstPrefilledCoord();
    const center = preferred || mapInstanceRef.current.getCenter();
    const safe = enforceCenter(
      preferred || getSafeCenter(center?.lat ?? center?.lat?.(), center?.lng ?? center?.lng?.())
    );
    const radiusMeters = computeVisibleRadiusMeters(radiusKm * 1000);
    suppressNextMoveRef.current = true;
    loadAndPlaceMarkersRef.current(safe.lat, safe.lng, mapInstanceRef.current.getZoom(), radiusMeters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilledBusinesses, radiusKm, mapReady]);

  // Client-side geocode for prefilled businesses missing coords (best-effort)
  useEffect(() => {
    const list = prefilledBusinessesRef.current || [];
    const missing = list.filter((biz) => !biz?.coords && (biz.address || biz.city));
    if (!missing.length) return;
    if (!mapReady) return;

    let cancelled = false;

    const run = async () => {
      const updated = [...list];
      let changed = false;
      const limit = 15;
      for (const biz of missing.slice(0, limit)) {
        if (cancelled) return;
        const addressLine = [biz.address, biz.city, biz.state, biz.country]
          .filter(Boolean)
          .join(", ");
        const coords = await geocodeAddress(addressLine);
        if (coords) {
          const idx = updated.findIndex((b) => b.id === biz.id);
          if (idx >= 0) {
            updated[idx] = {
              ...updated[idx],
              coords,
              latitude: coords.lat,
              longitude: coords.lng,
              lat: coords.lat,
              lng: coords.lng,
            };
            changed = true;
          }
        }
      }

      if (changed && !cancelled) {
        prefilledBusinessesRef.current = updated;
        setBusinesses((prev) =>
          prev.map((b) => {
            const replacement = updated.find((u) => u.id === b.id);
            return replacement || b;
          })
        );
        const map = mapInstanceRef.current;
        if (map && loadAndPlaceMarkersRef.current) {
          const center = map.getCenter();
          const safe = enforceCenter(
            getSafeCenter(center?.lat ?? center?.lat?.(), center?.lng ?? center?.lng?.())
          );
          suppressNextMoveRef.current = true;
          loadAndPlaceMarkersRef.current(
            safe.lat,
            safe.lng,
            map.getZoom(),
            computeVisibleRadiusMeters(radiusKm * 1000)
          );
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilledBusinesses]);

  // Hard render for prefilled mode to ensure markers appear even without Places
  useEffect(() => {
    if (!disableGooglePlaces) return;
    if (!mapReady || !mapInstanceRef.current) return;
    const list = prefilledBusinessesRef.current || [];
    if (!list.length) return;
    const withCoords = list.filter(
      (biz) =>
        biz?.coords &&
        typeof biz.coords.lat === "number" &&
        typeof biz.coords.lng === "number" &&
        biz.coords.lat !== 0 &&
        biz.coords.lng !== 0
    );
    if (withCoords.length) {
      setBusinesses(list);
      renderMarkers(list, activeCategory);
      const first = withCoords[0];
      mapInstanceRef.current.setCenter({ lng: first.coords.lng, lat: first.coords.lat });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, disableGooglePlaces, mapReady, prefilledBusinesses]);

  return (
    <div
      ref={containerRef}
      className={containerClassName}
      data-clickdiag={clickDiagEnabled ? "map-container" : undefined}
    >
      <div className={cardClassName}>
        {title ? <div className="mb-3 font-medium">{title}</div> : null}
        {enableSearch ? (
          <form onSubmit={handleSearch} className="mb-3 flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                id="map-search"
                name="map-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search nearby places"
                className="flex-1 rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder:text-white/60 focus:outline-none focus:border-white/50"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 disabled:opacity-60"
                disabled={searchLoading || !searchTerm.trim()}
              >
                {searchLoading ? "Searching..." : "Search"}
              </button>
            </div>
            {searchError ? <div className="text-xs text-rose-200">{searchError}</div> : null}
            {searchMessage ? <div className="text-xs text-emerald-200">{searchMessage}</div> : null}
          </form>
        ) : null}
        {error ? (
          <div className="mb-3 text-sm text-amber-200/90 bg-amber-500/15 border border-amber-300/30 rounded-xl px-3 py-2">
            {error}
          </div>
        ) : null}
        {enableCategoryFilter ? (
          <div className="mb-3 space-y-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/60">
              Filter by category
            </div>
            <div className="flex flex-wrap gap-2">
              {["All", ...categories].map((cat) => {
                const count = categoriesWithCounts.find((c) => c.name === cat)?.count;
                const label =
                  cat === "All" && businesses.length
                    ? `All (${businesses.length})`
                    : count
                      ? `${cat} (${count})`
                      : cat;

                return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1 rounded-full border text-xs transition ${
                    activeCategory === cat
                      ? "bg-white text-black border-white"
                      : "bg-white/5 border-white/20 text-white/80 hover:border-white/40"
                  }`}
                  aria-pressed={activeCategory === cat}
                  disabled={loading || businesses.length === 0}
                >
                  {label}
                </button>
                );
              })}
            </div>
            {!loading && !error && businesses.length === 0 ? (
              <div className="text-xs text-white/60">
                No businesses found in this area yet. Icons will appear as data comes in.
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="relative flex-1 min-h-0">
          <div
            className={mapClassName}
            ref={mapRef}
            id="mapbox-map"
            style={{ pointerEvents: "auto", touchAction: "auto", position: "relative", zIndex: 1 }}
          />
        </div>
        {loading && <div className="mt-2 text-sm text-white/70">Loading map...</div>}
        {error && <div className="mt-2 text-sm text-rose-400">{error}</div>}
        {!enableSearch && searchError ? (
          <div className="mt-2 text-sm text-rose-300">{searchError}</div>
        ) : null}
        {!enableSearch && searchMessage ? (
          <div className="mt-2 text-sm text-emerald-200">{searchMessage}</div>
        ) : null}
      </div>
    </div>
  );
}
