"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BusinessCard from "@/components/cards/BusinessCard";
import { useLocation } from "@/components/location/LocationProvider";
import {
  getNormalizedLocation,
  hasCoordinates,
  hasUsableLocationFilter,
  haversineDistanceKm,
} from "@/lib/location/filter";

type PopularNearYouSectionProps = {
  mode?: "public" | "customer";
  title?: string;
  sectionId?: string;
  subtitle?: string;
  distanceThresholdMiles?: number;
  limit?: number;
  badgeMode?: "trending" | "nearby" | "none";
};

type NearbyBusiness = {
  id?: string | null;
  public_id?: string | null;
  business_name?: string | null;
  business_type?: string | null;
  category?: string | null;
  city?: string | null;
  state?: string | null;
  profile_photo_url?: string | null;
  cover_photo_url?: string | null;
  verification_status?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  distanceMiles?: number | null;
};

const SKELETON_CARDS = Array.from({ length: 4 });
const KM_TO_MILES = 0.621371;

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getBusinessCoords(business: NearbyBusiness) {
  const lat = parseNumber(business?.latitude ?? business?.lat);
  const lng = parseNumber(business?.longitude ?? business?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function buildQuery(location: ReturnType<typeof getNormalizedLocation>) {
  const params = new URLSearchParams();
  if (location.city) params.set("city", location.city);
  if (location.state) params.set("state", location.state);
  if (typeof location.lat === "number") params.set("lat", String(location.lat));
  if (typeof location.lng === "number") params.set("lng", String(location.lng));
  return params.toString();
}

function sortBusinessesByDistance(
  businesses: NearbyBusiness[],
  location: ReturnType<typeof getNormalizedLocation>,
  limit = 8
) {
  const canMeasureDistance = hasCoordinates(location);

  return businesses
    .map((business) => {
      const coords = getBusinessCoords(business);
      const distanceKm =
        canMeasureDistance && coords ? haversineDistanceKm(location, coords) : Number.POSITIVE_INFINITY;

      return {
        ...business,
        distanceMiles: Number.isFinite(distanceKm) ? distanceKm * KM_TO_MILES : null,
      };
    })
    .filter((business) => Boolean(business.public_id))
    .sort((left, right) => {
      const leftDistance = left.distanceMiles ?? Number.POSITIVE_INFINITY;
      const rightDistance = right.distanceMiles ?? Number.POSITIVE_INFINITY;
      return leftDistance - rightDistance;
    })
    .slice(0, limit);
}

function createBusinessBadges(
  business: NearbyBusiness,
  index: number,
  badgeMode: PopularNearYouSectionProps["badgeMode"]
) {
  void business;
  if (badgeMode === "none") return [];

  if (badgeMode === "trending") {
    if (index >= 2 && index < 4) return ["New"];
  }

  return [];
}

function PopularNearYouSkeleton() {
  return (
    <section className="mt-16 md:mt-20">
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 w-48 animate-pulse rounded-full bg-slate-200/80" />
            <div className="h-4 w-36 animate-pulse rounded-full bg-slate-200/70" />
          </div>
          <div className="hidden h-5 w-20 animate-pulse rounded-full bg-slate-200/70 sm:block" />
        </div>

        <div className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:overflow-visible xl:grid-cols-4">
          {SKELETON_CARDS.map((_, index) => (
            <div
              key={`popular-near-you-skeleton-${index}`}
              className="w-[280px] min-w-[280px] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md md:w-full md:min-w-0"
            >
              <div className="h-[180px] animate-pulse bg-slate-200/80" />
              <div className="space-y-3 px-4 pb-4 pt-3">
                <div className="h-4 w-3/4 animate-pulse rounded-full bg-slate-200/80" />
                <div className="h-4 w-1/2 animate-pulse rounded-full bg-slate-200/70" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function PopularNearYouSection({
  mode = "public",
  title,
  sectionId,
  subtitle,
  distanceThresholdMiles,
  limit = 8,
  badgeMode = "trending",
}: PopularNearYouSectionProps) {
  const { location, hydrated } = useLocation();
  const normalizedLocation = useMemo(() => getNormalizedLocation(location || {}), [location]);
  const [businesses, setBusinesses] = useState<NearbyBusiness[]>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hydrated) return undefined;

    if (!hasUsableLocationFilter(normalizedLocation)) {
      setBusinesses([]);
      setLoading(false);
      setReady(true);
      return undefined;
    }

    const controller = new AbortController();

    const loadBusinesses = async () => {
      setLoading(true);
      setReady(false);

      try {
        const response = await fetch(`/api/public-businesses?${buildQuery(normalizedLocation)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          setBusinesses([]);
          setReady(true);
          return;
        }

        const nextBusinesses = sortBusinessesByDistance(
          Array.isArray(payload?.businesses) ? payload.businesses : [],
          normalizedLocation,
          Math.max(limit * 2, 8)
        );
        setBusinesses(nextBusinesses);
        setReady(true);
      } catch (error: unknown) {
        if ((error as { name?: string } | null)?.name === "AbortError") return;
        setBusinesses([]);
        setReady(true);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadBusinesses();

    return () => controller.abort();
  }, [hydrated, limit, normalizedLocation]);

  const viewAllHref = mode === "customer" ? "/customer/nearby" : "/nearby";
  const locationLabel = useMemo(() => {
    if (normalizedLocation.city && normalizedLocation.state) {
      return `Based on your location in ${normalizedLocation.city}, ${normalizedLocation.state}`;
    }
    if (normalizedLocation.city) {
      return `Based on your location in ${normalizedLocation.city}`;
    }
    return "Discover businesses near you";
  }, [normalizedLocation.city, normalizedLocation.state]);
  const visibleBusinesses = useMemo(() => {
    let nextBusinesses = businesses;

    if (typeof distanceThresholdMiles === "number" && Number.isFinite(distanceThresholdMiles)) {
      const withinRadius = businesses.filter((business) => {
        const miles = business.distanceMiles;
        return typeof miles === "number" && Number.isFinite(miles) && miles <= distanceThresholdMiles;
      });
      if (withinRadius.length > 0) {
        nextBusinesses = withinRadius;
      }
    }

    return nextBusinesses.slice(0, limit);
  }, [businesses, distanceThresholdMiles, limit]);
  const resolvedTitle = useMemo(() => {
    if (title) return title;
    if (typeof distanceThresholdMiles === "number" && Number.isFinite(distanceThresholdMiles)) {
      if (normalizedLocation.city) return `Near ${normalizedLocation.city}`;
      return `Within ${distanceThresholdMiles} miles`;
    }
    return "Trending near you";
  }, [distanceThresholdMiles, normalizedLocation.city, title]);
  const resolvedSubtitle = useMemo(() => {
    if (subtitle) return subtitle;
    if (typeof distanceThresholdMiles === "number" && Number.isFinite(distanceThresholdMiles)) {
      if (normalizedLocation.city) {
        return `Closest verified shops and favorites around ${normalizedLocation.city}`;
      }
      return `Places worth visiting within ${distanceThresholdMiles} miles`;
    }
    return locationLabel;
  }, [distanceThresholdMiles, locationLabel, normalizedLocation.city, subtitle]);

  if (!hydrated) return null;
  if (loading && !ready) return <PopularNearYouSkeleton />;
  if (!visibleBusinesses.length) return null;

  return (
    <section id={sectionId} className="mt-16 md:mt-20">
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 md:mb-8">
          <div className="min-w-0">
            <h2 className="text-[1.65rem] font-semibold tracking-[-0.04em] text-slate-900">
              {resolvedTitle}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{resolvedSubtitle}</p>
          </div>

          <Link
            href={viewAllHref}
            prefetch={false}
            className="inline-flex items-center gap-1 self-center text-sm font-medium text-purple-600 transition-all duration-300 hover:translate-x-0.5 hover:text-purple-700"
          >
            View all <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:overflow-visible xl:grid-cols-4">
          {visibleBusinesses.map((business, index) => (
            <div
              key={business.public_id || business.id || business.business_name}
              className="md:min-w-0"
            >
              <BusinessCard
                business={business}
                badges={createBusinessBadges(business, index, badgeMode)}
                isVerified={["auto_verified", "manually_verified"].includes(
                  String(business?.verification_status || "")
                )}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
