import BusinessProfilePage from "@/components/business/profile/BusinessProfilePage";
import { requireEffectiveRole } from "@/lib/auth/requireEffectiveRole";
import { getBusinessByUserId } from "@/lib/business/getBusinessByUserId";

async function safeQuery(promise, fallback, label) {
  try {
    const result = await promise;
    if (result.error) {
      if (!isMissingColumnError(result.error)) {
        console.error(`[business profile] ${label} query failed`, result.error);
      }
      return { data: fallback, count: 0, error: result.error };
    }
    return { data: result.data ?? fallback, count: result.count ?? 0, error: null };
  } catch (err) {
    console.error(`[business profile] ${label} query failed`, err);
    return { data: fallback, count: 0, error: err };
  }
}

const REVIEW_SELECT_BASE =
  "id, business_id, customer_id, rating, title, body, created_at, business_reply, business_reply_at";
const REVIEW_SELECT_WITH_UPDATED = `${REVIEW_SELECT_BASE}, updated_at`;

function isMissingColumnError(error) {
  if (!error) return false;
  if (error?.code === "42703") return true;
  return /column "([^"]+)" does not exist/i.test(error?.message || "");
}

async function fetchReviewList(supabase, businessId) {
  const baseQuery = supabase
    .from("business_reviews")
    .select(REVIEW_SELECT_BASE)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .range(0, 5);

  const withUpdatedQuery = supabase
    .from("business_reviews")
    .select(REVIEW_SELECT_WITH_UPDATED)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .range(0, 5);

  const withUpdatedResult = await safeQuery(withUpdatedQuery, [], "reviews");
  if (withUpdatedResult.error && isMissingColumnError(withUpdatedResult.error)) {
    return safeQuery(baseQuery, [], "reviews");
  }
  return withUpdatedResult;
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

export default async function BusinessProfileRoute() {
  const { supabase, effectiveUserId } = await requireEffectiveRole("business");

  const galleryQuery = supabase
    .from("business_gallery_photos")
    .select("id, business_id, photo_url, caption, sort_order, created_at")
    .eq("business_id", effectiveUserId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  const reviewRatingQuery = supabase
    .from("business_reviews")
    .select("rating")
    .eq("business_id", effectiveUserId);

  const listingsQuery = supabase
    .from("listings")
    .select(
      "id, public_id, business_id, title, price, category, category_id, category_info:business_categories(name,slug), photo_url, created_at"
    )
    .eq("business_id", effectiveUserId)
    .order("created_at", { ascending: false });

  const announcementsQuery = supabase
    .from("business_announcements")
    .select("id, business_id, title, body, is_published, starts_at, ends_at, created_at")
    .eq("business_id", effectiveUserId)
    .order("created_at", { ascending: false });

  const [profileResult, galleryResult, reviewListResult, reviewRatingsResult, listingsResult, announcementsResult] =
    await Promise.all([
      getBusinessByUserId({
        client: supabase,
        userId: effectiveUserId,
      })
        .then((data) => ({ data, count: 0, error: null }))
        .catch((error) => {
          console.error("[business profile] profile query failed", error);
          return { data: null, count: 0, error };
        }),
      safeQuery(galleryQuery, [], "gallery"),
      fetchReviewList(supabase, effectiveUserId),
      safeQuery(reviewRatingQuery, [], "review ratings"),
      safeQuery(listingsQuery, [], "listings"),
      safeQuery(announcementsQuery, [], "announcements"),
    ]);

  const rawProfile = profileResult.data || {};
  const profile = (rawProfile && Object.keys(rawProfile).length ? {
    id: rawProfile.id,
    role: rawProfile.role,
    full_name: rawProfile.full_name,
    business_name: rawProfile.business_name,
    business_type: rawProfile.business_type,
    category: rawProfile.category,
    description: rawProfile.description,
    website: rawProfile.website,
    phone: rawProfile.phone,
    email: rawProfile.email,
    address: rawProfile.address,
    address_2: rawProfile.address_2,
    city: rawProfile.city,
    state: rawProfile.state,
    postal_code: rawProfile.postal_code,
    hours_json: rawProfile.hours_json ?? null,
    social_links_json: rawProfile.social_links_json ?? null,
    profile_photo_url: rawProfile.profile_photo_url,
    cover_photo_url: rawProfile.cover_photo_url,
  } : null) || {
    id: effectiveUserId,
    business_name: "",
    full_name: "",
    business_type: "",
    category: "",
    description: "",
    website: "",
    phone: "",
    email: "",
    address: "",
    address_2: "",
    city: "",
    state: "",
    postal_code: "",
    hours_json: null,
    social_links_json: null,
    profile_photo_url: "",
    cover_photo_url: "",
  };

  const ratingSummary = buildRatingSummary(reviewRatingsResult.data || []);

  return (
    <BusinessProfilePage
      initialProfile={profile}
      initialGallery={galleryResult.data || []}
      initialReviews={reviewListResult.data || []}
      initialReviewCount={ratingSummary.count}
      initialListings={listingsResult.data || []}
      initialAnnouncements={announcementsResult.data || []}
      ratingSummary={ratingSummary}
    />
  );
}
