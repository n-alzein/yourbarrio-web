"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  hasLocation,
  isSameLocation,
  normalizeLocation,
  LOCATION_STORAGE_KEY,
} from "@/lib/location";
import {
  readLocationClient,
  setLocationCookieClient,
} from "@/lib/location/setLocationCookieClient";

const LocationContext = createContext(null);
export const LOCATION_CHANGED_EVENT = "yb:location-changed";

export function LocationProvider({ children }) {
  const [location, setLocationState] = useState(() => normalizeLocation({}));
  const [hydrated, setHydrated] = useState(false);
  const locationRef = useRef(location);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  const applyLocation = useCallback((next) => {
    const normalized = normalizeLocation(next);
    if (!isSameLocation(normalized, locationRef.current)) {
      setLocationState(normalized);
    }
    return normalized;
  }, []);

  const setLocation = useCallback(
    (next) => {
      const normalized = applyLocation(next);
      const persisted = setLocationCookieClient(normalized);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(LOCATION_CHANGED_EVENT, {
            detail: normalizeLocation(persisted || {}),
          })
        );
      }
    },
    [applyLocation]
  );

  const clearLocation = useCallback(() => {
    setLocation({});
  }, [setLocation]);

  useEffect(() => {
    const stored = readLocationClient();
    if (stored) {
      applyLocation(stored);
      setLocationCookieClient(stored);
    }
    setHydrated(true);
  }, [applyLocation]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onLocationChanged = (event) => {
      const detail = normalizeLocation(event?.detail || {});
      if (!isSameLocation(detail, locationRef.current)) {
        setLocationState(detail);
      }
    };
    window.addEventListener(LOCATION_CHANGED_EVENT, onLocationChanged);
    return () => window.removeEventListener(LOCATION_CHANGED_EVENT, onLocationChanged);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onStorage = (event) => {
      if (event.key !== LOCATION_STORAGE_KEY) return;
      const next = readLocationClient();
      if (!next) return;
      const normalized = normalizeLocation(next);
      if (!isSameLocation(normalized, locationRef.current)) {
        setLocationState(normalized);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!hydrated || hasLocation(locationRef.current)) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (cancelled || hasLocation(locationRef.current)) return;
        const lat = pos?.coords?.latitude;
        const lng = pos?.coords?.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        try {
          const res = await fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`);
          if (!res.ok) return;
          const data = await res.json();
          const city = (data?.city || "").trim();
          if (city && !cancelled && !hasLocation(locationRef.current)) {
            setLocation({ city, lat, lng, updatedAt: Date.now() });
          }
        } catch {
          /* best effort */
        }
      },
      () => {
        /* ignore geolocation errors */
      },
      { timeout: 8000 }
    );
    return () => {
      cancelled = true;
    };
  }, [hydrated, setLocation]);

  const value = useMemo(
    () => ({
      location,
      hydrated,
      hasLocation: hasLocation(location),
      setLocation,
      clearLocation,
    }),
    [location, hydrated, setLocation, clearLocation]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error("useLocation must be used within LocationProvider");
  }
  return ctx;
}
