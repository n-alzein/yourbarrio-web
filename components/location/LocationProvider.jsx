"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  hasLocation,
  isSameLocation,
  normalizeLocation,
  LOCATION_STORAGE_KEY,
} from "@/lib/location";
import { readLocationClient, setLocationCookieClient } from "@/lib/location/setLocationCookieClient";

const IP_REFRESH_TTL_MS = 24 * 60 * 60 * 1000;
const GPS_REFRESH_TTL_MS = 6 * 60 * 60 * 1000;

const LocationContext = createContext(null);
export const LOCATION_CHANGED_EVENT = "yb:location-changed";

const buildLabel = (city, region) => {
  if (!city) return null;
  return region ? `${city}, ${region}` : city;
};

const isFresh = (location) => {
  if (!location || !Number.isFinite(Number(location.updatedAt))) return false;
  if (location.source === "manual") return true;
  const ttl = location.source === "gps" ? GPS_REFRESH_TTL_MS : IP_REFRESH_TTL_MS;
  return Date.now() - Number(location.updatedAt) <= ttl;
};

const normalizeForState = (next) => normalizeLocation(next || {});

export function LocationProvider({ children }) {
  const [location, setLocationState] = useState(() => normalizeForState(readLocationClient()));
  const [hydrated, setHydrated] = useState(false);
  const locationRef = useRef(location);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  const applyLocation = useCallback((next) => {
    const normalized = normalizeForState(next);
    if (!isSameLocation(normalized, locationRef.current)) {
      setLocationState(normalized);
    }
    const persisted = setLocationCookieClient({
      ...next,
      updatedAt: Number.isFinite(Number(next?.updatedAt)) ? Number(next.updatedAt) : Date.now(),
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(LOCATION_CHANGED_EVENT, {
          detail: normalizeForState(persisted || normalized),
        })
      );
    }
    return normalized;
  }, []);

  const refreshIpLocation = useCallback(async () => {
    try {
      const res = await fetch("/api/geo/ip", { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      const city = typeof data?.city === "string" ? data.city.trim() : "";
      const region = typeof data?.region === "string" ? data.region.trim() : "";
      const country = typeof data?.country === "string" ? data.country.trim() : "";
      const lat = Number.isFinite(Number(data?.lat)) ? Number(data.lat) : null;
      const lng = Number.isFinite(Number(data?.lng)) ? Number(data.lng) : null;
      if (!city && !region && !country && lat == null && lng == null) return null;
      const next = {
        source: "ip",
        city: city || null,
        region: region || null,
        country: country || null,
        lat,
        lng,
        label: buildLabel(city || null, region || null),
        updatedAt: Date.now(),
      };
      applyLocation(next);
      return next;
    } catch {
      return null;
    }
  }, [applyLocation]);

  const requestGpsLocation = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return null;

    const next = await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos?.coords?.latitude;
          const lng = pos?.coords?.longitude;
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            resolve(null);
            return;
          }

          const existing = normalizeForState(locationRef.current);
          let city = existing.city || null;
          let region = existing.region || null;
          let country = existing.country || null;

          try {
            const geocodeRes = await fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`);
            if (geocodeRes.ok) {
              const geocode = await geocodeRes.json();
              const reverseCity = String(geocode?.city || "").trim();
              if (reverseCity) city = reverseCity;
            }
          } catch {
            // Best effort reverse geocode.
          }

          resolve({
            source: "gps",
            city,
            region,
            country,
            lat,
            lng,
            label: buildLabel(city, region),
            updatedAt: Date.now(),
          });
        },
        () => resolve(null),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );
    });

    if (!next) return null;
    applyLocation(next);
    return next;
  }, [applyLocation]);

  const setLocation = useCallback(
    (next) => {
      const normalized = normalizeForState(next);
      const source =
        next?.source === "ip" || next?.source === "gps" || next?.source === "manual"
          ? next.source
          : "manual";
      return applyLocation({
        ...normalized,
        source,
        label: normalized.label || buildLabel(normalized.city, normalized.region),
        updatedAt: Date.now(),
      });
    },
    [applyLocation]
  );

  const setManualLocation = useCallback(
    (next) => setLocation({ ...next, source: "manual" }),
    [setLocation]
  );

  const clearLocation = useCallback(() => {
    setLocation({});
  }, [setLocation]);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      const stored = readLocationClient();
      if (stored && !cancelled) {
        const normalized = normalizeForState(stored);
        if (!isSameLocation(normalized, locationRef.current)) {
          setLocationState(normalized);
        }
      }
      if (!stored || !isFresh(stored)) {
        await refreshIpLocation();
      }
      if (!cancelled) {
        setHydrated(true);
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [refreshIpLocation]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onLocationChanged = (event) => {
      const detail = normalizeForState(event?.detail || {});
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
      const normalized = normalizeForState(next);
      if (!isSameLocation(normalized, locationRef.current)) {
        setLocationState(normalized);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo(
    () => ({
      location,
      hydrated,
      hasLocation: hasLocation(location),
      setLocation,
      setManualLocation,
      clearLocation,
      refreshIpLocation,
      requestGpsLocation,
    }),
    [location, hydrated, setLocation, setManualLocation, clearLocation, refreshIpLocation, requestGpsLocation]
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

