import { NextResponse } from "next/server";
import { getBusinessDataClientForRequest } from "@/lib/business/getBusinessDataClientForRequest";

const REVIEW_SELECT_BASE =
  "id,business_id,customer_id,rating,title,body,created_at,business_reply,business_reply_at";
const REVIEW_SELECT_WITH_UPDATED = `${REVIEW_SELECT_BASE},updated_at`;

function buildRatingSummary(rows = []) {
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  let count = 0;

  rows.forEach((row) => {
    const rating = Number(row?.rating || 0);
    if (rating >= 1 && rating <= 5) {
      breakdown[rating] += 1;
      sum += rating;
      count += 1;
    }
  });

  return {
    count,
    average: count ? sum / count : 0,
    breakdown,
  };
}

function isMissingColumnError(error) {
  if (!error) return false;
  return error?.code === "42703" || /column "([^"]+)" does not exist/i.test(error?.message || "");
}

async function getBusinessReview(supabase, reviewId, businessId) {
  const { data, error } = await supabase
    .from("business_reviews")
    .select("id,business_id")
    .eq("id", reviewId)
    .eq("business_id", businessId)
    .maybeSingle();

  return { data, error };
}

async function resolveReviewId(params) {
  const resolvedParams = await Promise.resolve(params);
  return String(resolvedParams?.id || "").trim();
}

export async function PATCH(request, { params }) {
  const access = await getBusinessDataClientForRequest({
    includeEffectiveProfile: false,
    ensureVendorMembership: false,
    timingLabel: "business-review-reply",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const reviewId = await resolveReviewId(params);
  if (!reviewId) {
    return NextResponse.json({ error: "Missing review id" }, { status: 400 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const businessReply = String(payload?.businessReply || "").trim();
  const clearReply = payload?.clearReply === true;

  if (!clearReply && !businessReply) {
    return NextResponse.json({ error: "Reply cannot be empty." }, { status: 400 });
  }

  const supabase = access.client;
  const businessId = access.effectiveUserId;
  const { data: review, error: reviewError } = await getBusinessReview(
    supabase,
    reviewId,
    businessId
  );

  if (reviewError) {
    return NextResponse.json(
      { error: reviewError.message || "Failed to load review" },
      { status: 500 }
    );
  }

  if (!review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  const updatePayload = clearReply
    ? { business_reply: null, business_reply_at: null }
    : { business_reply: businessReply, business_reply_at: new Date().toISOString() };

  let { data: updatedReview, error: updateError } = await supabase
    .from("business_reviews")
    .update(updatePayload)
    .eq("id", reviewId)
    .eq("business_id", businessId)
    .select(REVIEW_SELECT_WITH_UPDATED)
    .maybeSingle();

  if (updateError && isMissingColumnError(updateError)) {
    ({ data: updatedReview, error: updateError } = await supabase
      .from("business_reviews")
      .update(updatePayload)
      .eq("id", reviewId)
      .eq("business_id", businessId)
      .select(REVIEW_SELECT_BASE)
      .maybeSingle());
  }

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || "Failed to update reply" },
      { status: 500 }
    );
  }

  if (!updatedReview) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  const response = NextResponse.json({ success: true, review: updatedReview }, { status: 200 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function DELETE(_request, { params }) {
  const access = await getBusinessDataClientForRequest({
    includeEffectiveProfile: false,
    ensureVendorMembership: false,
    timingLabel: "business-review-delete",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const reviewId = await resolveReviewId(params);
  if (!reviewId) {
    return NextResponse.json({ error: "Missing review id" }, { status: 400 });
  }

  const supabase = access.client;
  const businessId = access.effectiveUserId;

  const { data: review, error: reviewError } = await getBusinessReview(
    supabase,
    reviewId,
    businessId
  );

  if (reviewError) {
    return NextResponse.json(
      { error: reviewError.message || "Failed to load review" },
      { status: 500 }
    );
  }

  if (!review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  const { data: deletedReview, error: deleteError } = await supabase
    .from("business_reviews")
    .delete()
    .eq("id", reviewId)
    .eq("business_id", businessId)
    .select("id")
    .maybeSingle();

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message || "Failed to delete review" },
      { status: 500 }
    );
  }

  if (!deletedReview) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  const { data: ratingRows, error: ratingsError } = await supabase
    .from("business_reviews")
    .select("rating")
    .eq("business_id", businessId);

  if (ratingsError) {
    return NextResponse.json(
      { error: ratingsError.message || "Failed to refresh rating summary" },
      { status: 500 }
    );
  }

  const response = NextResponse.json(
    {
      success: true,
      deletedReviewId: reviewId,
      ratingSummary: buildRatingSummary(ratingRows || []),
    },
    { status: 200 }
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
