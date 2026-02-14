"use client";

import { useEffect, useReducer, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import PublicBusinessHero from "@/components/publicBusinessProfile/PublicBusinessHero";
import BusinessAbout from "@/components/publicBusinessProfile/BusinessAbout";
import BusinessAnnouncementsPreview from "@/components/publicBusinessProfile/BusinessAnnouncementsPreview";
import BusinessGalleryGrid from "@/components/publicBusinessProfile/BusinessGalleryGrid";
import BusinessListingsGrid from "@/components/publicBusinessProfile/BusinessListingsGrid";
import BusinessReviewsPanel from "@/components/publicBusinessProfile/BusinessReviewsPanel";
import ViewerContextEnhancer from "@/components/public/ViewerContextEnhancer";
import { getCustomerBusinessUrl } from "@/lib/ids/publicRefs";

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

function PreviewSkeleton({ withContainer = true }) {
  const content = (
    <>
      <div className="rounded-none border border-white/10 bg-white/5 p-6 md:p-8">
        <div className="h-5 w-32 rounded bg-white/10" />
        <div className="mt-4 space-y-2">
          <div className="h-4 w-full rounded bg-white/10" />
          <div className="h-4 w-5/6 rounded bg-white/10" />
          <div className="h-4 w-4/6 rounded bg-white/10" />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div className="rounded-none border border-white/10 bg-white/5 p-6 md:p-8 space-y-4">
          <div className="h-5 w-40 rounded bg-white/10" />
          <div className="h-20 w-full rounded bg-white/10" />
        </div>
        <div className="rounded-none border border-white/10 bg-white/5 p-6 md:p-8">
          <div className="h-5 w-32 rounded bg-white/10" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="h-28 rounded bg-white/10" />
            <div className="h-28 rounded bg-white/10" />
            <div className="h-28 rounded bg-white/10" />
            <div className="h-28 rounded bg-white/10" />
          </div>
        </div>
      </div>

      <div className="rounded-3xl rounded-t-none border border-white/10 bg-white/5 p-6 md:p-8">
        <div className="h-5 w-32 rounded bg-white/10" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-40 rounded bg-white/10" />
          <div className="h-40 rounded bg-white/10" />
          <div className="h-40 rounded bg-white/10" />
        </div>
      </div>
    </>
  );

  if (!withContainer) return content;

  return (
    <div className="mx-auto max-w-6xl px-6 md:px-10 pb-16 space-y-8 mt-6">
      {content}
    </div>
  );
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
    error: null,
  };

  const initState = (id) => {
    const cached = readPreviewCache(id);
    if (cached?.profile) {
      return {
        profile: cached.profile ?? null,
        announcements: cached.announcements || [],
        gallery: cached.gallery || [],
        listings: cached.listings || [],
        reviews: cached.reviews || [],
        ratingSummary: cached.ratingSummary || EMPTY_SUMMARY,
        loading: false,
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
        return {
          ...state,
          profile: action.payload.profile ?? null,
          announcements: action.payload.announcements || [],
          gallery: action.payload.gallery || [],
          listings: action.payload.listings || [],
          reviews: action.payload.reviews || [],
          ratingSummary: action.payload.ratingSummary || EMPTY_SUMMARY,
          loading: false,
          error: null,
        };
      case "REQUEST":
        return {
          ...state,
          loading: true,
          error: null,
        };
      case "SUCCESS":
        return {
          profile: action.payload.profile ?? null,
          announcements: action.payload.announcements || [],
          gallery: action.payload.gallery || [],
          listings: action.payload.listings || [],
          reviews: action.payload.reviews || [],
          ratingSummary: action.payload.ratingSummary || EMPTY_SUMMARY,
          loading: false,
          error: null,
        };
      case "ERROR":
        return {
          ...state,
          loading: false,
          error: action.error || "preview-load-failed",
        };
      default:
        return state;
    }
  };

  const [state, dispatch] = useReducer(reducer, businessId, initState);
  const { profile, announcements, gallery, listings, reviews, ratingSummary, loading } =
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
      dispatch({ type: "REQUEST" });

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

      const reviewsSelectBase =
        "id,business_id,customer_id,rating,title,body,created_at,business_reply,business_reply_at";
      const reviewsSelectWithUpdated = `${reviewsSelectBase},updated_at`;
      const reviewsQuery = client
        .from("business_reviews")
        .select(reviewsSelectWithUpdated)
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(10);

      const ratingsQuery = client
        .from("business_reviews")
        .select("rating")
        .eq("business_id", businessId);

      let reviewsResult = await reviewsQuery;
      if (reviewsResult?.error?.code === "42703") {
        reviewsResult = await client
          .from("business_reviews")
          .select(reviewsSelectBase)
          .eq("business_id", businessId)
          .order("created_at", { ascending: false })
          .limit(10);
      }

      const [
        profileResult,
        announcementsResult,
        galleryResult,
        listingsResult,
        ratingsResult,
      ] = await Promise.all([
        profileQuery,
        announcementsQuery,
        galleryQuery,
        listingsQuery,
        ratingsQuery,
      ]);

      console.log("[public business] reviews load", {
        businessId,
        reviewsCount: reviewsResult?.data?.length || 0,
        ratingsCount: ratingsResult?.data?.length || 0,
      });

      if (!active) return;

      if (!active) return;

      dispatch({
        type: "SUCCESS",
        payload: {
          profile: profileResult?.data
            ? {
                ...profileResult.data,
                id: profileResult.data.owner_user_id,
                full_name: null,
              }
            : null,
          announcements: announcementsResult?.data || [],
          gallery: galleryResult?.data || [],
          listings: listingsResult?.data || [],
          reviews: reviewsResult?.data || [],
          ratingSummary: ratingsResult?.data
            ? buildRatingSummary(ratingsResult.data)
            : EMPTY_SUMMARY,
        },
      });
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
      <div className="min-h-screen text-white -mt-20">
        <div className="h-[170px] sm:h-[200px] md:h-[230px] bg-gradient-to-br from-slate-900 via-purple-900/70 to-black" />
        <PreviewSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white -mt-20">
      <PublicBusinessHero
        profile={profile}
        ratingSummary={ratingSummary}
        publicPath={getCustomerBusinessUrl(profile || { id: businessId })}
      />

      <div className="mx-auto max-w-6xl px-6 md:px-10 pb-16 space-y-8">
        <BusinessAbout profile={profile} className="rounded-none" />

        {loading ? (
          <PreviewSkeleton withContainer={false} />
        ) : (
          <>
            <BusinessAnnouncementsPreview
              announcements={announcements}
              className="rounded-none"
            />
            <BusinessGalleryGrid photos={gallery} className="rounded-none" />
            <BusinessListingsGrid listings={listings} className="rounded-none" />
            <ViewerContextEnhancer>
              <BusinessReviewsPanel
                businessId={businessId}
                initialReviews={reviews}
                ratingSummary={ratingSummary}
                reviewCount={ratingSummary?.count || reviews?.length || 0}
                loading={loading}
                className="rounded-b-3xl rounded-t-none"
              />
            </ViewerContextEnhancer>
          </>
        )}
      </div>
    </div>
  );
}
