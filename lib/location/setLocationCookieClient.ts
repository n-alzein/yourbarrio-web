"use client";

import {
  decodeLocation,
  encodeLocation,
  LEGACY_CITY_KEY,
  LEGACY_LOCATION_COOKIE_NAME,
  LOCATION_COOKIE_NAME,
  LOCATION_STORAGE_KEY,
  normalizeLocationState,
  type LocationState,
} from "@/lib/location/locationCookie";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

const readCookie = (name: string) => {
  if (typeof document === "undefined") return "";
  const escaped = name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? match[1] : "";
};

const writeCookie = (name: string, value: string, maxAge: number) => {
  if (typeof document === "undefined") return;
  const secure = typeof window !== "undefined" && window.location.protocol === "https:";
  const secureToken = secure ? "; secure" : "";
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; samesite=lax${secureToken}`;
};

const clearCookie = (name: string) => {
  writeCookie(name, "", 0);
};

export const readLocationCookieClient = (): LocationState | null => {
  const primary = decodeLocation(readCookie(LOCATION_COOKIE_NAME));
  if (primary) return primary;
  return decodeLocation(readCookie(LEGACY_LOCATION_COOKIE_NAME));
};

export const readLocationStorageClient = (): LocationState | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCATION_STORAGE_KEY);
    if (raw) {
      const parsed = decodeLocation(raw) || normalizeLocationState(JSON.parse(raw));
      if (parsed) return parsed;
    }
  } catch {
    // Ignore malformed storage.
  }

  try {
    const legacyCity = window.localStorage.getItem(LEGACY_CITY_KEY);
    if (legacyCity) {
      return normalizeLocationState({ city: legacyCity, updatedAt: Date.now() });
    }
  } catch {
    // Ignore malformed legacy storage.
  }

  return null;
};

export const readLocationClient = (): LocationState | null => {
  return readLocationCookieClient() || readLocationStorageClient();
};

export const setLocationCookieClient = (next: unknown) => {
  const base =
    next && typeof next === "object" ? (next as Record<string, unknown>) : {};
  const normalized = normalizeLocationState({ ...base, updatedAt: Date.now() });

  if (!normalized) {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(LOCATION_STORAGE_KEY);
        window.localStorage.removeItem(LEGACY_CITY_KEY);
      } catch {
        // Ignore storage write failures.
      }
    }
    clearCookie(LOCATION_COOKIE_NAME);
    clearCookie(LEGACY_LOCATION_COOKIE_NAME);
    return null;
  }

  const encoded = encodeLocation(normalized);
  if (!encoded) return null;

  writeCookie(LOCATION_COOKIE_NAME, encoded, MAX_AGE_SECONDS);
  clearCookie(LEGACY_LOCATION_COOKIE_NAME);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(normalized));
      if (normalized.city) {
        window.localStorage.setItem(LEGACY_CITY_KEY, normalized.city);
      } else {
        window.localStorage.removeItem(LEGACY_CITY_KEY);
      }
    } catch {
      // Ignore storage write failures.
    }
  }

  return normalized;
};
