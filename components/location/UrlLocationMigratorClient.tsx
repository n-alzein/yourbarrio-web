"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LOCATION_CHANGED_EVENT } from "@/components/location/LocationProvider";
import { readLocationClient, setLocationCookieClient } from "@/lib/location/setLocationCookieClient";
import type { LocationState } from "@/lib/location/locationCookie";

const LOCATION_QUERY_KEYS = new Set([
  "city",
  "state",
  "region",
  "zip",
  "lat",
  "lng",
  "placeId",
  "place_id",
]);
const SHAREABLE_PARAMS_ALLOWLIST = new Set(["q", "page", "sort", "category", "view", "tab"]);

const toFloat = (value: string | null) => {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export default function UrlLocationMigratorClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastHandledKeyRef = useRef("");

  useEffect(() => {
    if (!pathname) return;

    const currentQuery = searchParams?.toString() || "";
    const currentKey = `${pathname}?${currentQuery}`;
    if (lastHandledKeyRef.current === currentKey) return;
    lastHandledKeyRef.current = currentKey;

    const hasLegacyLocation = Array.from(LOCATION_QUERY_KEYS).some((key) =>
      searchParams?.get(key)
    );

    if (!hasLegacyLocation) return;

    const existing: Partial<LocationState> = readLocationClient() || {};
    const nextLocation = {
      ...existing,
      city: searchParams?.get("city") || existing.city,
      region:
        searchParams?.get("state") ||
        searchParams?.get("region") ||
        existing.region,
      zip: searchParams?.get("zip") || existing.zip,
      lat: toFloat(searchParams?.get("lat")) ?? existing.lat,
      lng: toFloat(searchParams?.get("lng")) ?? existing.lng,
      placeId:
        searchParams?.get("placeId") ||
        searchParams?.get("place_id") ||
        existing.placeId,
      updatedAt: Date.now(),
    };

    const persisted = setLocationCookieClient(nextLocation);
    if (persisted && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(LOCATION_CHANGED_EVENT, { detail: persisted }));
    }

    const cleaned = new URLSearchParams();
    const entries = Array.from(searchParams?.entries() || []);
    entries.forEach(([key, value]) => {
      if (LOCATION_QUERY_KEYS.has(key)) return;
      if (!SHAREABLE_PARAMS_ALLOWLIST.has(key)) return;
      cleaned.append(key, value);
    });

    const nextQuery = cleaned.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    if (nextUrl !== currentKey) {
      router.replace(nextUrl, { scroll: false });
    }
  }, [pathname, router, searchParams]);

  return null;
}
