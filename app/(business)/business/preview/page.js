import { requireEffectiveRole } from "@/lib/auth/requireEffectiveRole";
import PublicBusinessHero from "@/components/publicBusinessProfile/PublicBusinessHero";
import BusinessAbout from "@/components/publicBusinessProfile/BusinessAbout";
import BusinessAnnouncementsPreview from "@/components/publicBusinessProfile/BusinessAnnouncementsPreview";
import BusinessGalleryGrid from "@/components/publicBusinessProfile/BusinessGalleryGrid";
import BusinessListingsGrid from "@/components/publicBusinessProfile/BusinessListingsGrid";
import BusinessReviewsPanel from "@/components/publicBusinessProfile/BusinessReviewsPanel";
import PreviewAutoRefresh from "@/components/business/preview/PreviewAutoRefresh";
import ViewerContextEnhancer from "@/components/public/ViewerContextEnhancer";
import { getCustomerBusinessUrl } from "@/lib/ids/publicRefs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROFILE_FIELDS = [
  "id",
  "public_id",
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
        console.error(`[business preview] ${label} query failed`, result.error);
      }
      return { data: fallback, count: 0, error: result.error };
    }
    return { data: result.data ?? fallback, count: result.count ?? 0, error: null };
  } catch (err) {
    console.error(`[business preview] ${label} query failed`, err);
    return { data: fallback, count: 0, error: err };
  }
}

async function fetchProfile(supabase, id) {
  const { data, error } = await supabase
    .from("users")
    .select(PROFILE_FIELDS)
    .eq("id", id)
    .eq("role", "business")
    .maybeSingle();

  if (error) {
    console.error("[business preview] profile query failed", error);
    return null;
  }

  return data ?? null;
}

function buildListingsQuery(supabase, businessId, limit, filters) {
  let query = supabase
    .from("listings")
    .select(
      "id,public_id,business_id,title,description,price,category,category_id,category_info:business_categories(name,slug),city,photo_url,created_at"
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
  if (result.error?.code === "42703") {
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

export default async function BusinessPreviewPage() {
  const { supabase, effectiveUserId } = await requireEffectiveRole("business");

  const profile = await fetchProfile(supabase, effectiveUserId);

  if (!profile) {
    return (
      <div className="min-h-screen text-white -mt-20">
        <div className="h-[170px] sm:h-[200px] md:h-[230px] bg-gradient-to-br from-slate-900 via-purple-900/70 to-black" />
        <div className="mx-auto max-w-4xl px-6 md:px-10 py-24 text-center">
          <h1 className="text-3xl md:text-4xl font-semibold">
            Preview unavailable.
          </h1>
          <p className="mt-3 text-sm md:text-base text-white/70">
            Your business profile is not ready yet.
          </p>
        </div>
      </div>
    );
  }

  const [gallery, announcements, listings, reviews, reviewRatings] =
    await Promise.all([
      fetchGallery(supabase, effectiveUserId),
      fetchAnnouncements(supabase, effectiveUserId),
      fetchListingsWithFallback(supabase, effectiveUserId, 24),
      fetchReviews(supabase, effectiveUserId),
      fetchReviewRatings(supabase, effectiveUserId),
    ]);

  const ratingSummary = buildRatingSummary(reviewRatings || []);

  return (
    <div className="pointer-events-none min-h-screen text-white -mt-20">
      <PreviewAutoRefresh businessId={effectiveUserId} />
      <PublicBusinessHero
        profile={profile}
        ratingSummary={ratingSummary}
        publicPath={getCustomerBusinessUrl(profile || { id: effectiveUserId })}
      />

      <div className="mx-auto max-w-6xl px-6 md:px-10 pb-16 space-y-8">
        <BusinessAbout profile={profile} className="rounded-none" />
        <BusinessAnnouncementsPreview
          announcements={announcements}
          className="rounded-none"
        />
        <BusinessGalleryGrid photos={gallery} className="rounded-none" />
        <BusinessListingsGrid listings={listings} className="rounded-none" />
        <ViewerContextEnhancer>
          <BusinessReviewsPanel
            businessId={effectiveUserId}
            initialReviews={reviews}
            ratingSummary={ratingSummary}
            reviewCount={ratingSummary?.count || reviews?.length || 0}
            className="rounded-b-3xl rounded-t-none"
          />
        </ViewerContextEnhancer>
      </div>
    </div>
  );
}
