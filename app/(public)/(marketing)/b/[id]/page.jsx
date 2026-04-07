import { unstable_cache } from "next/cache";
import { notFound, permanentRedirect } from "next/navigation";
import { getPublicBusinessByOwnerId } from "@/lib/business/getPublicBusinessByOwnerId";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getPublicSupabaseServerClient } from "@/lib/supabasePublicServer";
import PublicBusinessHero from "@/components/publicBusinessProfile/PublicBusinessHero";
import BusinessAbout from "@/components/publicBusinessProfile/BusinessAbout";
import BusinessAnnouncementsPreview from "@/components/publicBusinessProfile/BusinessAnnouncementsPreview";
import BusinessGalleryGrid from "@/components/publicBusinessProfile/BusinessGalleryGrid";
import BusinessListingsGrid from "@/components/publicBusinessProfile/BusinessListingsGrid";
import BusinessReviewsPanel from "@/components/publicBusinessProfile/BusinessReviewsPanel";
import PublicBusinessPreviewClient from "@/components/publicBusinessProfile/PublicBusinessPreviewClient";
import ProfileViewTracker from "@/components/publicBusinessProfile/ProfileViewTracker";
import ViewerContextEnhancer from "@/components/public/ViewerContextEnhancer";
import { ProfileSectionNav } from "@/components/business/profile-system/ProfileSystem";
import {
  sanitizeAnnouncements,
  sanitizeGalleryPhotos,
  sanitizeListings,
  sanitizePublicProfile,
  sanitizeReviews,
} from "@/lib/publicBusinessProfile/normalize";

const PUBLIC_CACHE_SECONDS = 300;
const PERF_ENV_FLAG = "YB_PROFILE_PERF";
const LOOKUP_DEBUG_ENV_FLAG = "YB_PROFILE_LOOKUP_DEBUG";
const UUID_ANY_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isMissingColumnError(error) {
  if (!error) return false;
  return error?.code === "42703";
}

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

async function safeQuery(promise, fallback, label) {
  try {
    const result = await promise;
    if (result.error) {
      const code = result.error?.code;
      const quietCodes = new Set(["42703", "42P01"]);
      if (!quietCodes.has(code)) {
        console.error(`[public business] ${label} query failed`, result.error);
      }
      return { data: fallback, count: 0, error: result.error };
    }
    return {
      data: result.data ?? fallback,
      count: result.count ?? 0,
      error: null,
    };
  } catch (err) {
    console.error(`[public business] ${label} query failed`, err);
    return { data: fallback, count: 0, error: err };
  }
}

async function fetchPublicProfile(id) {
  const profile = await getPublicBusinessByOwnerId(id);
  if (!profile) {
    console.warn("[monitor] public_business_not_found_or_unverified", {
      ownerUserId: id,
      route: "/customer/b/[id]",
    });
  }
  return profile;
}

async function resolveBusinessRef(idOrPublicId) {
  const normalizedRef = String(idOrPublicId || "").trim();
  if (!normalizedRef) return null;

  const isUuidLookup = UUID_ANY_RE.test(normalizedRef);
  const supabase = getPublicSupabaseServerClient();
  const logEnabled =
    process.env.NODE_ENV !== "production" &&
    process.env[LOOKUP_DEBUG_ENV_FLAG] === "1";
  let lookupKey = isUuidLookup ? "id" : "public_id";

  let { data, error } = await supabase
    .from("businesses")
    .select("id,owner_user_id,public_id")
    .eq(lookupKey, normalizedRef)
    .maybeSingle();

  // Backward compatibility for older UUID links that may have used owner_user_id.
  if (!data && !error && isUuidLookup) {
    lookupKey = "owner_user_id";
    const ownerLookup = await supabase
      .from("businesses")
      .select("id,owner_user_id,public_id")
      .eq("owner_user_id", normalizedRef)
      .maybeSingle();
    data = ownerLookup.data;
    error = ownerLookup.error;
  }

  if (logEnabled) {
    console.log("[public business] route lookup", {
      idOrPublicId: normalizedRef,
      key: lookupKey,
      found: Boolean(data && !error),
    });
  }

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[public business] business ref lookup failed", {
        idOrPublicId: normalizedRef,
        key: lookupKey,
        code: error.code || null,
        message: error.message || null,
      });
    }
    return null;
  }

  if (!data?.owner_user_id) return null;
  return {
    id: data.owner_user_id,
    public_id: data.public_id || null,
  };
}

function buildListingsQuery(supabase, businessId, limit, filters) {
  let query = supabase
    .from("listings")
    .select(
      "id,public_id,business_id,title,price,category,category_id,category_info:business_categories(name,slug),city,photo_url,created_at"
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.status) {
    query = query.eq("status", "active");
  }
  if (filters.is_published) {
    query = query.eq("is_published", true);
  }
  if (filters.is_test) {
    query = query.eq("is_test", false);
  }

  return query;
}

async function fetchListingsWithFallback(supabase, businessId, limit) {
  const filterSets = [
    { status: true, is_published: true, is_test: true },
    { status: true, is_published: true },
    { is_published: true, is_test: true },
    { status: true },
    { is_published: true },
    { is_test: true },
    {},
  ];

  for (const filters of filterSets) {
    const result = await safeQuery(
      buildListingsQuery(supabase, businessId, limit, filters),
      [],
      "listings"
    );
    if (result.data?.length) {
      return result.data;
    }
  }

  return [];
}

async function fetchAnnouncements(supabase, businessId) {
  const nowIso = new Date().toISOString();
  const query = supabase
    .from("business_announcements")
    .select("id,business_id,title,body,starts_at,ends_at,created_at")
    .eq("business_id", businessId)
    .eq("is_published", true)
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
    .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
    .order("created_at", { ascending: false })
    .limit(3);

  const result = await safeQuery(query, [], "announcements");
  return result.data || [];
}

async function fetchGallery(supabase, businessId) {
  const query = supabase
    .from("business_gallery_photos")
    .select("id,business_id,photo_url,caption,sort_order,created_at")
    .eq("business_id", businessId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(12);

  const result = await safeQuery(query, [], "gallery");
  return result.data || [];
}

async function fetchReviews(supabase, businessId) {
  const baseQuery = supabase
    .from("business_reviews")
    .select(
      "id,business_id,customer_id,rating,title,body,created_at,business_reply,business_reply_at"
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(10);

  const withUpdatedQuery = supabase
    .from("business_reviews")
    .select(
      "id,business_id,customer_id,rating,title,body,created_at,updated_at,business_reply,business_reply_at"
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(10);

  const result = await safeQuery(withUpdatedQuery, [], "reviews");
  if (result.error && isMissingColumnError(result.error)) {
    const fallback = await safeQuery(baseQuery, [], "reviews");
    return fallback.data || [];
  }
  return result.data || [];
}

async function fetchReviewRatings(supabase, businessId) {
  const query = supabase
    .from("business_reviews")
    .select("rating")
    .eq("business_id", businessId);

  const result = await safeQuery(query, [], "review ratings");
  return result.data || [];
}

function descriptionSnippet(value) {
  if (!value) return "Discover this local business on YourBarrio.";
  const trimmed = value.trim();
  if (trimmed.length <= 160) return trimmed;
  return `${trimmed.slice(0, 157)}...`;
}

const getPublicProfileCached = unstable_cache(
  async (businessId) => {
    return fetchPublicProfile(businessId);
  },
  ["public-business-profile"],
  { revalidate: PUBLIC_CACHE_SECONDS }
);

const getPublicListingsCached = unstable_cache(
  async (businessId, limit) => {
    const supabase = getPublicSupabaseServerClient();
    return fetchListingsWithFallback(supabase, businessId, limit);
  },
  ["public-business-listings"],
  { revalidate: PUBLIC_CACHE_SECONDS }
);

const getPublicGalleryCached = unstable_cache(
  async (businessId) => {
    const supabase = getPublicSupabaseServerClient();
    return fetchGallery(supabase, businessId);
  },
  ["public-business-gallery"],
  { revalidate: PUBLIC_CACHE_SECONDS }
);

const getPublicAnnouncementsCached = unstable_cache(
  async (businessId) => {
    const supabase = getPublicSupabaseServerClient();
    return fetchAnnouncements(supabase, businessId);
  },
  ["public-business-announcements"],
  { revalidate: PUBLIC_CACHE_SECONDS }
);

const getPublicReviewsCached = unstable_cache(
  async (businessId) => {
    const supabase = getPublicSupabaseServerClient();
    return fetchReviews(supabase, businessId);
  },
  ["public-business-reviews"],
  { revalidate: PUBLIC_CACHE_SECONDS }
);

const getPublicReviewRatingsCached = unstable_cache(
  async (businessId) => {
    const supabase = getPublicSupabaseServerClient();
    return fetchReviewRatings(supabase, businessId);
  },
  ["public-business-review-ratings"],
  { revalidate: PUBLIC_CACHE_SECONDS }
);

function createPerfLogger({ enabled, label, businessId }) {
  const startedAt = performance.now();
  const spans = [];

  return {
    async time(name, fn) {
      const start = performance.now();
      const result = await fn();
      spans.push({ name, ms: performance.now() - start });
      return result;
    },
    end(extra = {}) {
      if (!enabled) return;
      const totalMs = performance.now() - startedAt;
      console.log(`[perf] ${label}`, {
        businessId,
        totalMs: Math.round(totalMs),
        spans,
        ...extra,
      });
    },
  };
}


export async function generateMetadata({ params }) {
  const resolvedParams = await Promise.resolve(params);
  const idOrPublicId = resolvedParams?.id;
  const resolvedRef = await resolveBusinessRef(idOrPublicId);
  const businessId = resolvedRef?.id || null;
  const businessPublicId = resolvedRef?.public_id || null;
  const profile = businessId ? await getPublicProfileCached(businessId) : null;
  if (!profile) {
    return {
      title: "Business profile unavailable",
      description: "This business profile is not available yet.",
    };
  }

  const listingPreview = await getPublicListingsCached(businessId, 1);
  const isEligible = listingPreview.length > 0;

  if (!isEligible) {
    return {
      title: "Business profile unavailable",
      description: "This business profile is not available yet.",
    };
  }

  const name =
    profile?.business_name || profile?.full_name || "Local business";
  const description = descriptionSnippet(profile?.description);
  const image = profile?.cover_photo_url || profile?.profile_photo_url;

  return {
    title: `${name} on YourBarrio`,
    description,
    alternates: {
      canonical: `/customer/b/${businessPublicId || businessId || ""}`,
    },
    openGraph: {
      title: `${name} on YourBarrio`,
      description,
      images: image ? [{ url: image }] : [],
    },
  };
}

export default async function PublicBusinessProfilePage({
  params,
  searchParams,
  shell = "public",
}) {
  const resolvedParams = await Promise.resolve(params);
  const resolvedSearch = await Promise.resolve(searchParams);
  const idOrPublicId = String(resolvedParams?.id || "").trim();
  if (!idOrPublicId) notFound();
  const resolvedRef = await resolveBusinessRef(idOrPublicId);
  if (!resolvedRef?.id) notFound();
  const businessId = resolvedRef.id;
  const businessPublicId = String(resolvedRef.public_id || "").trim();
  if (UUID_ANY_RE.test(idOrPublicId) && businessPublicId) {
    permanentRedirect(`/customer/b/${encodeURIComponent(businessPublicId)}`);
  }
  const publicPath = `/customer/b/${encodeURIComponent(businessPublicId || businessId)}`;
  const isPreview = resolvedSearch?.preview === "1";
  const perfEnabled =
    resolvedSearch?.perf === "1" || process.env[PERF_ENV_FLAG] === "1";
  const perf = createPerfLogger({
    enabled: perfEnabled,
    label: "public-business-profile",
    businessId,
  });

  if (isPreview) {
    return <PublicBusinessPreviewClient businessId={businessId} trackView={false} />;
  }

  const useAuthenticatedClient = shell === "customer";
  const supabase = useAuthenticatedClient
    ? await getSupabaseServerClient()
    : null;
  const profileResult = await perf.time("profile", () =>
    getPublicProfileCached(businessId)
  );
  const profile = sanitizePublicProfile(profileResult);

  if (!profile) {
    perf.end({ outcome: "missing-profile" });
    notFound();
  }

  const publicReadClient = supabase || getPublicSupabaseServerClient();
  const listingPreview = await perf.time("listings-preview", () =>
    useAuthenticatedClient
      ? fetchListingsWithFallback(publicReadClient, businessId, 1)
      : getPublicListingsCached(businessId, 1)
  );
  const isEligible = listingPreview.length > 0;

  if (!isEligible) {
    perf.end({ outcome: "unpublished" });
    notFound();
  }

  const [galleryResult, announcementsResult, listingsResult, reviewsResult, reviewRatings] =
    await Promise.all([
      perf.time("gallery", () =>
        useAuthenticatedClient
          ? fetchGallery(publicReadClient, businessId)
          : getPublicGalleryCached(businessId)
      ),
      perf.time("announcements", () =>
        useAuthenticatedClient
          ? fetchAnnouncements(publicReadClient, businessId)
          : getPublicAnnouncementsCached(businessId)
      ),
      perf.time("listings", () =>
        useAuthenticatedClient
          ? fetchListingsWithFallback(publicReadClient, businessId, 24)
          : getPublicListingsCached(businessId, 24)
      ),
      perf.time("reviews", () =>
        useAuthenticatedClient
          ? fetchReviews(publicReadClient, businessId)
          : getPublicReviewsCached(businessId)
      ),
      perf.time("review-ratings", () =>
        useAuthenticatedClient
          ? fetchReviewRatings(publicReadClient, businessId)
          : getPublicReviewRatingsCached(businessId)
      ),
    ]);

  const gallery = sanitizeGalleryPhotos(galleryResult);
  const announcements = sanitizeAnnouncements(announcementsResult);
  const listings = sanitizeListings(listingsResult);
  const reviews = sanitizeReviews(reviewsResult);

  const ratingSummary = buildRatingSummary(reviewRatings || []);
  perf.end({ outcome: "ok" });

  const isCustomerShell = shell === "customer";
  const wrapperClassName =
    isCustomerShell
      ? "min-h-screen bg-[#f8fafc] text-white -mt-28 md:-mt-20"
      : "min-h-screen bg-[#f8fafc] text-white -mt-20";
  const contentShellPadding = isCustomerShell
    ? "mx-auto max-w-[1180px] px-0 sm:px-6 md:px-8 pb-14"
    : "mx-auto max-w-[1180px] px-4 sm:px-6 md:px-8 pb-14";
  const sectionShellClassName = "rounded-none";
  const reviewsShellClassName = "rounded-none";

  return (
    <div className={wrapperClassName}>
      <ProfileViewTracker businessId={businessId} />
      <PublicBusinessHero
        profile={profile}
        ratingSummary={ratingSummary}
        publicPath={publicPath}
        shell={shell}
      />

      <div className={contentShellPadding}>
        <ProfileSectionNav
          items={[
            { id: "about", label: "About" },
            { id: "listings", label: "Listings" },
            { id: "reviews", label: "Reviews" },
            { id: "updates", label: "Updates" },
            { id: "gallery", label: "Gallery" },
          ]}
        />

        <div className="space-y-8">
          <BusinessAbout profile={profile} className={sectionShellClassName} />
          <BusinessListingsGrid listings={listings} className={sectionShellClassName} />
          <ViewerContextEnhancer>
            <BusinessReviewsPanel
              businessId={businessId}
              initialReviews={reviews}
              ratingSummary={ratingSummary}
              reviewCount={ratingSummary?.count || reviews?.length || 0}
              className={reviewsShellClassName}
            />
          </ViewerContextEnhancer>
          <BusinessAnnouncementsPreview
            announcements={announcements}
            className={sectionShellClassName}
          />
          <BusinessGalleryGrid photos={gallery} className={sectionShellClassName} />
        </div>
      </div>
    </div>
  );
}
