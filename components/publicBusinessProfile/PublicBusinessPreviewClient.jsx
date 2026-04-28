"use client";

import { useEffect, useReducer, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import BusinessProfileView from "@/components/publicBusinessProfile/BusinessProfileView";
import PublicBusinessProfileSkeleton from "@/components/publicBusinessProfile/PublicBusinessProfileSkeleton";
import {
  ProfilePageShell,
} from "@/components/business/profile-system/ProfileSystem";
import { getBusinessPublicUrl } from "@/lib/ids/publicRefs";
import {
  sanitizeAnnouncements,
  sanitizeGalleryPhotos,
  sanitizeListings,
  sanitizePublicProfile,
  sanitizeReviews,
} from "@/lib/publicBusinessProfile/normalize";
import { fetchBusinessReviews } from "@/lib/publicBusinessProfile/reviews";
import { withListingPricing } from "@/lib/pricing";

const EMPTY_SUMMARY = {
  count: 0,
  average: 0,
  breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

function buildRatingSummary(rows) {
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  let count = 0;

  rows.forEach((row) => {
    const rating = Number(row.rating || 0);
    if (rating >= 1 && rating <= 5) {
      breakdown[rating] += 1;
      sum += rating;
      count += 1;
    }
  });

  const average = count ? sum / count : 0;
  return { count, average, breakdown };
}

function readPreviewCache(businessId) {
  if (!businessId || typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`yb_public_preview_${businessId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.businessId !== businessId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function sanitizePreviewPayload(payload) {
  return {
    profile: sanitizePublicProfile(payload?.profile),
    announcements: sanitizeAnnouncements(payload?.announcements),
    gallery: sanitizeGalleryPhotos(payload?.gallery),
    listings: sanitizeListings(payload?.listings),
    reviews: sanitizeReviews(payload?.reviews),
    ratingSummary: payload?.ratingSummary || EMPTY_SUMMARY,
  };
}

export default function PublicBusinessPreviewClient({
  businessId,
  onReady,
  trackView = true,
}) {
  const initialState = {
    profile: null,
    announcements: [],
    gallery: [],
    listings: [],
    reviews: [],
    ratingSummary: EMPTY_SUMMARY,
    loading: true,
    refreshing: false,
    error: null,
  };

  const initState = (id) => {
    const cached = readPreviewCache(id);
    if (cached?.profile) {
      const safePayload = sanitizePreviewPayload(cached);
      return {
        profile: safePayload.profile,
        announcements: safePayload.announcements,
        gallery: safePayload.gallery,
        listings: safePayload.listings,
        reviews: safePayload.reviews,
        ratingSummary: safePayload.ratingSummary,
        loading: false,
        refreshing: false,
        error: null,
      };
    }
    return initialState;
  };

  const reducer = (state, action) => {
    switch (action.type) {
      case "RESET":
        return initialState;
      case "HYDRATE_FROM_CACHE":
        {
          const safePayload = sanitizePreviewPayload(action.payload);
        return {
          ...state,
          profile: safePayload.profile,
          announcements: safePayload.announcements,
          gallery: safePayload.gallery,
          listings: safePayload.listings,
          reviews: safePayload.reviews,
          ratingSummary: safePayload.ratingSummary,
          loading: false,
          refreshing: false,
          error: null,
        };
      }
      case "REQUEST":
        return {
          ...state,
          loading: !action.preserve,
          refreshing: Boolean(action.preserve),
          error: null,
        };
      case "SUCCESS":
        {
          const safePayload = sanitizePreviewPayload(action.payload);
        return {
          profile: safePayload.profile,
          announcements: safePayload.announcements,
          gallery: safePayload.gallery,
          listings: safePayload.listings,
          reviews: safePayload.reviews,
          ratingSummary: safePayload.ratingSummary,
          loading: false,
          refreshing: false,
          error: null,
        };
      }
      case "ERROR":
        return {
          ...state,
          loading: false,
          refreshing: false,
          error: action.error || "preview-load-failed",
        };
      default:
        return state;
    }
  };

  const [state, dispatch] = useReducer(reducer, businessId, initState);
  const { profile, announcements, gallery, listings, reviews, ratingSummary, loading, refreshing } =
    state;
  const viewTrackedRef = useRef(false);

  useEffect(() => {
    if (!businessId) {
      dispatch({ type: "RESET" });
      return;
    }
    const cached = readPreviewCache(businessId);
    if (cached?.profile) {
      dispatch({ type: "HYDRATE_FROM_CACHE", payload: cached });
    } else {
      dispatch({ type: "RESET" });
    }
  }, [businessId]);

  useEffect(() => {
    if (!trackView || !businessId || viewTrackedRef.current) return;
    viewTrackedRef.current = true;

    fetch("/api/business/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId }),
      keepalive: true,
    }).catch(() => {});
  }, [businessId, trackView]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!businessId) return;
      const client = getSupabaseBrowserClient();
      if (!client) return;
      const cached = readPreviewCache(businessId);
      dispatch({ type: "REQUEST", preserve: Boolean(cached?.profile) });

      const profileQuery = client
        .from("businesses")
        .select(
          "id,owner_user_id,public_id,business_name,category,description,website,phone,address,city,profile_photo_url,cover_photo_url,hours_json,social_links_json,verification_status"
        )
        .eq("owner_user_id", businessId)
        .maybeSingle();

      const nowIso = new Date().toISOString();

      const announcementsQuery = client
        .from("business_announcements")
        .select("id,business_id,title,body,starts_at,ends_at,created_at")
        .eq("business_id", businessId)
        .eq("is_published", true)
        .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
        .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
        .order("created_at", { ascending: false })
        .limit(3);

      const galleryQuery = client
        .from("business_gallery_photos")
        .select("id,business_id,photo_url,caption,sort_order,created_at")
        .eq("business_id", businessId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(12);

      const listingsQuery = client
        .from("listings")
        .select(
          "id,business_id,title,price,category,category_id,category_info:business_categories(name,slug),city,photo_url,created_at"
        )
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(24);

      const ratingsQuery = client
        .from("business_reviews")
        .select("rating")
        .eq("business_id", businessId);
      const reviewsPromise = fetchBusinessReviews(client, {
        businessId,
        limit: 10,
      });

      const [
        profileResult,
        announcementsResult,
        galleryResult,
        listingsResult,
        ratingsResult,
        reviewsWithAuthors,
      ] = await Promise.all([
        profileQuery,
        announcementsQuery,
        galleryQuery,
        listingsQuery,
        ratingsQuery,
        reviewsPromise,
      ]);

      console.log("[public business] reviews load", {
        businessId,
        reviewsCount: reviewsWithAuthors?.length || 0,
        ratingsCount: ratingsResult?.data?.length || 0,
      });

      if (!active) return;

      if (!active) return;

      const safeProfile = profileResult?.data
        ? sanitizePublicProfile({
            ...profileResult.data,
            id: profileResult.data.owner_user_id,
            full_name: null,
          })
        : null;

      dispatch({
        type: "SUCCESS",
        payload: {
          profile: safeProfile,
          announcements: sanitizeAnnouncements(announcementsResult?.data),
          gallery: sanitizeGalleryPhotos(galleryResult?.data),
          listings: sanitizeListings((listingsResult?.data || []).map((listing) => withListingPricing(listing))),
          reviews: sanitizeReviews(reviewsWithAuthors),
          ratingSummary: ratingsResult?.data
            ? buildRatingSummary(ratingsResult.data)
            : EMPTY_SUMMARY,
        },
      });
      if (typeof window !== "undefined" && safeProfile) {
        try {
          sessionStorage.setItem(
            `yb_public_preview_${businessId}`,
            JSON.stringify({
              businessId,
              profile: safeProfile,
              announcements: sanitizeAnnouncements(announcementsResult?.data),
              gallery: sanitizeGalleryPhotos(galleryResult?.data),
              listings: sanitizeListings(
                (listingsResult?.data || []).map((listing) => withListingPricing(listing))
              ),
              reviews: sanitizeReviews(reviewsWithAuthors),
              ratingSummary: ratingsResult?.data
                ? buildRatingSummary(ratingsResult.data)
                : EMPTY_SUMMARY,
            })
          );
        } catch {
          // ignore cache errors
        }
      }
    }

    load().catch((err) => {
      if (!active) return;
      dispatch({
        type: "ERROR",
        error: err?.message || "preview-load-failed",
      });
    });
    return () => {
      active = false;
    };
  }, [businessId]);

  useEffect(() => {
    if (!loading && profile) {
      onReady?.();
    }
  }, [loading, profile, onReady]);

  if (!profile) {
    return (
      <ProfilePageShell>
        <PublicBusinessProfileSkeleton withinProfileShell />
      </ProfilePageShell>
    );
  }

  return (
    <ProfilePageShell>
      {loading ? null : (
        <div className="relative">
          {refreshing ? (
            <div className="pointer-events-none absolute right-0 top-0 z-20">
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-white/92 px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm ring-1 ring-slate-100"
                data-testid="public-business-profile-refresh-indicator"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                Refreshing profile
              </span>
            </div>
          ) : null}
          <BusinessProfileView
            mode="public"
            profile={profile}
            businessId={businessId}
            publicPath={getBusinessPublicUrl(profile || { id: businessId })}
            ratingSummary={ratingSummary}
            listings={listings}
            reviews={reviews}
            announcements={announcements}
            gallery={gallery}
            loading={refreshing}
            sectionClassName="rounded-none"
            reviewsClassName="rounded-none"
          />
        </div>
      )}
    </ProfilePageShell>
  );
}
