import Link from "next/link";
import { unstable_cache } from "next/cache";
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

const PROFILE_FIELDS = [
  "id",
  "role",
  "business_name",
  "full_name",
  "category",
  "description",
  "website",
  "phone",
  "address",
  "city",
  "profile_photo_url",
  "cover_photo_url",
  "hours_json",
  "social_links_json",
].join(",");

const OPTIONAL_PUBLISH_FIELDS = ["is_published", "is_verified", "is_active"];
const PROFILE_FIELDS_WITH_OPTIONAL = [
  PROFILE_FIELDS,
  OPTIONAL_PUBLISH_FIELDS.join(","),
].join(",");
const PUBLIC_CACHE_SECONDS = 300;
const PERF_ENV_FLAG = "YB_PROFILE_PERF";
const MISSING_COLUMN_RE = /column "([^"]+)" does not exist/i;

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

function pickPublishFlag(profile) {
  for (const key of OPTIONAL_PUBLISH_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(profile, key)) {
      return { key, value: Boolean(profile[key]) };
    }
  }
  return null;
}

function isMissingColumnError(error) {
  if (!error) return false;
  if (error?.code === "42703") return true;
  return MISSING_COLUMN_RE.test(error?.message || "");
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

async function fetchPublicProfile(supabase, id) {
  const withOptional = await supabase
    .from("users")
    .select(PROFILE_FIELDS_WITH_OPTIONAL)
    .eq("id", id)
    .eq("role", "business")
    .maybeSingle();

  if (withOptional.error) {
    if (isMissingColumnError(withOptional.error)) {
      const base = await supabase
        .from("users")
        .select(PROFILE_FIELDS)
        .eq("id", id)
        .eq("role", "business")
        .maybeSingle();
      if (base.error) {
        console.error("[public business] profile query failed", base.error);
        return null;
      }
      return base.data;
    }
    console.error("[public business] profile query failed", withOptional.error);
    return null;
  }

  return withOptional.data;
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
    const supabase = getPublicSupabaseServerClient();
    return fetchPublicProfile(supabase, businessId);
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
  const businessId = resolvedParams?.id;
  const profile = businessId ? await getPublicProfileCached(businessId) : null;
  if (!profile) {
    return {
      title: "Business profile unavailable",
      description: "This business profile is not available yet.",
    };
  }

  const publishFlag = pickPublishFlag(profile);
  let isEligible = false;

  if (publishFlag) {
    isEligible = publishFlag.value;
  } else {
    const listingPreview = await getPublicListingsCached(businessId, 1);
    isEligible = listingPreview.length > 0;
  }

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
      canonical: `/customer/b/${businessId || ""}`,
    },
    openGraph: {
      title: `${name} on YourBarrio`,
      description,
      images: image ? [{ url: image }] : [],
    },
  };
}

function UnavailableState() {
  return (
    <div className="min-h-screen text-white theme-lock">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900/70 to-black" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/60 to-black/90" />
        <div className="relative mx-auto max-w-4xl px-6 md:px-10 py-24 md:py-32 text-center">
          <h1 className="text-3xl md:text-4xl font-semibold">
            This business profile is not available.
          </h1>
          <p className="mt-3 text-sm md:text-base text-white/70">
            It may be offline or not ready for public viewing yet.
          </p>
          <Link
            href="/customer/home"
            className="mt-8 inline-flex items-center justify-center rounded-full bg-white/90 px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-white transition"
          >
            Back to customer home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function PublicBusinessProfilePage({
  params,
  searchParams,
  shell = "public",
}) {
  const resolvedParams = await Promise.resolve(params);
  const resolvedSearch = await Promise.resolve(searchParams);
  const businessId = resolvedParams?.id;
  if (!businessId) return <UnavailableState />;
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
  const profile = await perf.time("profile", () =>
    useAuthenticatedClient
      ? fetchPublicProfile(supabase, businessId)
      : getPublicProfileCached(businessId)
  );

  if (!profile) {
    perf.end({ outcome: "missing-profile" });
    return <UnavailableState />;
  }

  const publishFlag = pickPublishFlag(profile);
  let isEligible = false;

  if (publishFlag) {
    isEligible = publishFlag.value;
  } else {
    const listingPreview = await perf.time("listings-preview", () =>
      useAuthenticatedClient
        ? fetchListingsWithFallback(supabase, businessId, 1)
        : getPublicListingsCached(businessId, 1)
    );
    isEligible = listingPreview.length > 0;
  }

  if (!isEligible) {
    perf.end({ outcome: "unpublished" });
    return <UnavailableState />;
  }

  const [gallery, announcements, listings, reviews, reviewRatings] =
    await Promise.all([
      perf.time("gallery", () =>
        useAuthenticatedClient
          ? fetchGallery(supabase, businessId)
          : getPublicGalleryCached(businessId)
      ),
      perf.time("announcements", () =>
        useAuthenticatedClient
          ? fetchAnnouncements(supabase, businessId)
          : getPublicAnnouncementsCached(businessId)
      ),
      perf.time("listings", () =>
        useAuthenticatedClient
          ? fetchListingsWithFallback(supabase, businessId, 24)
          : getPublicListingsCached(businessId, 24)
      ),
      perf.time("reviews", () =>
        useAuthenticatedClient
          ? fetchReviews(supabase, businessId)
          : getPublicReviewsCached(businessId)
      ),
      perf.time("review-ratings", () =>
        useAuthenticatedClient
          ? fetchReviewRatings(supabase, businessId)
          : getPublicReviewRatingsCached(businessId)
      ),
    ]);

  const ratingSummary = buildRatingSummary(reviewRatings || []);
  perf.end({ outcome: "ok" });

  const isCustomerShell = shell === "customer";
  const wrapperClassName =
    isCustomerShell
      ? "min-h-screen text-white -mt-28 md:-mt-20"
      : "min-h-screen text-white -mt-20";
  const contentShellPadding = isCustomerShell
    ? "mx-auto max-w-6xl px-0 sm:px-6 md:px-10 pb-16 space-y-8"
    : "mx-auto max-w-6xl px-6 md:px-10 pb-16 space-y-8";
  const sectionShellClassName = isCustomerShell
    ? "rounded-none border-0 sm:border sm:border-white/10"
    : "rounded-none";
  const reviewsShellClassName = isCustomerShell
    ? "rounded-none border-0 sm:rounded-b-3xl sm:rounded-t-none sm:border sm:border-white/10"
    : "rounded-b-3xl rounded-t-none";

  return (
    <div className={wrapperClassName}>
      <ProfileViewTracker businessId={businessId} />
      <PublicBusinessHero
        profile={profile}
        ratingSummary={ratingSummary}
        publicPath={`/customer/b/${businessId}`}
        shell={shell}
      />

      <div className={contentShellPadding}>
        <BusinessAbout profile={profile} className={sectionShellClassName} />
        <BusinessAnnouncementsPreview
          announcements={announcements}
          className={sectionShellClassName}
        />
        <BusinessGalleryGrid photos={gallery} className={sectionShellClassName} />
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
      </div>
    </div>
  );
}
