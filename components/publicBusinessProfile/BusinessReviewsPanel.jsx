"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageSquareQuote, MessageSquareText, Star } from "lucide-react";
import { logMutation } from "@/lib/auth/requireSession";
import { getAuthedContext } from "@/lib/auth/getAuthedContext";
import { useAuth } from "@/components/AuthProvider";
import { useModal } from "@/components/modals/ModalProvider";
import { useViewerContext } from "@/components/public/ViewerContextEnhancer";
import ReportModal from "@/components/moderation/ReportModal";
import {
  attachReviewAuthorProfiles,
  getReviewAuthorDisplayName,
  mergePublicBusinessReview,
  REVIEW_SELECT_BASE,
  REVIEW_SELECT_WITH_UPDATED,
  isMissingColumnError,
} from "@/lib/publicBusinessProfile/reviews";

const REVIEW_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value) {
  if (!value) return "";
  try {
    return REVIEW_DATE_FORMATTER.format(new Date(value));
  } catch {
    return "";
  }
}

async function fetchPublicReviewFeed({
  businessId,
  from,
  to,
  limit,
  customerId,
  single = false,
}) {
  const params = new URLSearchParams({ businessId });
  if (typeof from === "number") params.set("from", String(from));
  if (typeof to === "number") params.set("to", String(to));
  if (typeof limit === "number") params.set("limit", String(limit));
  if (customerId) params.set("customerId", customerId);
  if (single) params.set("single", "1");

  const response = await fetch(`/api/public-business-reviews?${params.toString()}`, {
    credentials: "same-origin",
  });
  if (!response.ok) return single ? null : [];
  const payload = await response.json();
  return payload?.reviews ?? (single ? null : []);
}

function buildSummaryFromReviews(items = []) {
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0;
  let sum = 0;

  items.forEach((review) => {
    const rating = Number(review?.rating || 0);
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

function normalizeSummary(summary, fallbackReviews) {
  if (summary && typeof summary === "object") {
    const breakdown = summary.breakdown || {};
    const count = Number(summary.count || 0);
    if (count === 0 && fallbackReviews?.length) {
      return buildSummaryFromReviews(fallbackReviews);
    }
    return {
      count,
      average: Number(summary.average || 0),
      breakdown: {
        1: breakdown[1] || 0,
        2: breakdown[2] || 0,
        3: breakdown[3] || 0,
        4: breakdown[4] || 0,
        5: breakdown[5] || 0,
      },
    };
  }

  return buildSummaryFromReviews(fallbackReviews);
}

function isSameReviewList(prev = [], next = []) {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    if (prev[i]?.id !== next[i]?.id) return false;
    const prevAuthor = prev[i]?.author_profile || null;
    const nextAuthor = next[i]?.author_profile || null;
    if ((prevAuthor?.user_id || null) !== (nextAuthor?.user_id || null)) return false;
    if ((prevAuthor?.display_name || null) !== (nextAuthor?.display_name || null)) {
      return false;
    }
    if ((prevAuthor?.avatar_url || null) !== (nextAuthor?.avatar_url || null)) {
      return false;
    }
  }
  return true;
}

export default function BusinessReviewsPanel({
  businessId,
  businessName = "business",
  initialReviews,
  ratingSummary,
  reviewCount,
  loading = false,
  className = "",
  mode = "public",
}) {
  const { supabase } = useAuth();
  const { openModal } = useModal();
  const viewer = useViewerContext();
  const [reviews, setReviews] = useState(initialReviews || []);
  const [summary, setSummary] = useState(() => normalizeSummary(ratingSummary, []));
  const [loadingMore, setLoadingMore] = useState(false);
  const [customerProfiles, setCustomerProfiles] = useState({});
  const [customerReviewId, setCustomerReviewId] = useState(null);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState(null);
  const [editRating, setEditRating] = useState(0);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editError, setEditError] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [reportToast, setReportToast] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);
  const [ownerDeleteLoadingId, setOwnerDeleteLoadingId] = useState(null);
  const [ownerDeleteError, setOwnerDeleteError] = useState("");
  const [replyReviewId, setReplyReviewId] = useState(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyError, setReplyError] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);

  const customerId = viewer.user?.id || null;

  const reviewAverage = reviews.length
    ? reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0) /
      reviews.length
    : 0;
  const averageRating = summary?.count ? summary.average : reviewAverage;
  const totalReviews =
    typeof summary?.count === "number"
      ? summary.count
      : Math.max(reviewCount ?? 0, reviews.length);
  const shouldShowDistribution = totalReviews > 2;
  const pageSize = 6;

  const ratingRows = useMemo(() => {
    const breakdown = summary?.breakdown || {};
    return [5, 4, 3, 2, 1].map((value) => {
      const count = breakdown[value] || 0;
      const percent = totalReviews ? Math.round((count / totalReviews) * 100) : 0;
      return { value, count, percent };
    });
  }, [summary, totalReviews]);

  const canLoadMore = reviews.length < totalReviews;
  const isOwnerMode = mode === "owner";

  const handleLoadMore = async () => {
    if (!businessId || loadingMore) return;
    setLoadingMore(true);

    const from = reviews.length;
    const to = from + pageSize - 1;
    const enriched = await fetchPublicReviewFeed({
      businessId,
      from,
      to,
    });

    if (enriched?.length) {
      setReviews((prev) => [...prev, ...enriched]);
    }

    setLoadingMore(false);
  };

  const refreshVisibleReviews = async (nextSummary = null) => {
    const refreshed = await fetchPublicReviewFeed({
      businessId,
      limit: Math.max(reviews.length, pageSize),
    });
    const nextReviews = Array.isArray(refreshed) ? refreshed : [];
    setReviews(nextReviews);
    setSummary(normalizeSummary(nextSummary, nextReviews));
  };

  const startReply = (review) => {
    setReplyReviewId(review.id);
    setReplyBody(review.business_reply || "");
    setReplyError("");
    setOwnerDeleteError("");
  };

  const cancelReply = () => {
    setReplyReviewId(null);
    setReplyBody("");
    setReplyError("");
  };

  const handleSaveBusinessReply = async (review) => {
    if (!businessId || replyLoading) return;
    if (!replyBody.trim()) {
      setReplyError("Reply cannot be empty.");
      return;
    }

    setReplyLoading(true);
    setReplyError("");
    setOwnerDeleteError("");

    try {
      const response = await fetch(`/api/business/reviews/${review.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessReply: replyBody.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Could not save reply.");
      }

      const merged = mergePublicBusinessReview(review, payload?.review);
      setReviews((prev) =>
        prev.map((item) => (item.id === review.id ? merged : item))
      );
      cancelReply();
    } catch (err) {
      console.error("Failed to save business reply", err);
      setReplyError(err?.message || "Could not save reply.");
    } finally {
      setReplyLoading(false);
    }
  };

  const handleDeleteBusinessReply = async (review) => {
    if (!businessId || replyLoading) return;

    setReplyLoading(true);
    setReplyError("");
    setOwnerDeleteError("");

    try {
      const response = await fetch(`/api/business/reviews/${review.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearReply: true }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Could not delete reply.");
      }

      const merged = mergePublicBusinessReview(review, payload?.review);
      setReviews((prev) =>
        prev.map((item) => (item.id === review.id ? merged : item))
      );
      if (replyReviewId === review.id) {
        cancelReply();
      }
    } catch (err) {
      console.error("Failed to delete business reply", err);
      setReplyError(err?.message || "Could not delete reply.");
    } finally {
      setReplyLoading(false);
    }
  };

  useEffect(() => {
    if (Array.isArray(initialReviews)) {
      setReviews((prev) =>
        isSameReviewList(prev, initialReviews) ? prev : initialReviews
      );
    }
  }, [initialReviews]);

  useEffect(() => {
    setCustomerProfiles((prev) => {
      const next = { ...prev };
      reviews.forEach((review) => {
        const customerId = review?.customer_id;
        const profile = review?.author_profile;
        if (!customerId || !profile) return;
        next[customerId] = profile;
      });
      return next;
    });
  }, [reviews]);

  useEffect(() => {
    setSummary((prev) => normalizeSummary(ratingSummary, reviews) || prev);
  }, [ratingSummary]);

  useEffect(() => {
    let active = true;
    if (!businessId || !customerId) {
      setCustomerReviewId(null);
      return () => {};
    }

    const loadCustomerReview = async () => {
      const data = await fetchPublicReviewFeed({
        businessId,
        customerId,
        single: true,
      });

      if (!active) return;
      if (data) {
        setCustomerReviewId(data.id);
        setReviews((prev) => {
          if (prev.some((item) => item.id === data.id)) {
            return prev.map((item) =>
              item.id === data.id ? mergePublicBusinessReview(item, data) : item
            );
          }
          return [data, ...prev];
        });
      } else {
        setCustomerReviewId(null);
      }
    };

    loadCustomerReview();
    return () => {
      active = false;
    };
  }, [businessId, customerId, supabase]);

  useEffect(() => {
    let active = true;
    const ids = Array.from(new Set(reviews.map((item) => item.customer_id).filter(Boolean)));
    const missing = ids.filter((id) => {
      const profile = customerProfiles[id];
      return !profile || (!profile.display_name && !profile.avatar_url);
    });
    if (!missing.length) return () => {};

    const loadProfiles = async () => {
      const enriched = await fetchPublicReviewFeed({
        businessId,
        limit: Math.max(reviews.length, totalReviews || reviews.length || 10),
      });
      if (!active || !enriched.length) return;
      setReviews((prev) => (isSameReviewList(prev, enriched) ? prev : enriched));
    };

    loadProfiles();
    return () => {
      active = false;
    };
  }, [businessId, reviews, customerProfiles, supabase, totalReviews]);

  const handleSubmitReview = async (event) => {
    event.preventDefault();
    if (!businessId || submitting) return;

    if (!customerId) {
      setSubmitError("Log in to leave a review.");
      setSubmitSuccess("");
      return;
    }
    if (viewer.role && viewer.role !== "customer" && viewer.role !== "admin" && viewer.role !== "internal") {
      setSubmitError("Only customers can leave reviews.");
      setSubmitSuccess("");
      return;
    }
    if (customerReviewId) {
      setSubmitError("You already submitted a review.");
      setSubmitSuccess("");
      return;
    }
    if (!rating) {
      setSubmitError("Select a star rating.");
      setSubmitSuccess("");
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");

    let context;
    try {
      context = await getAuthedContext("createReview");
    } catch (err) {
      setSubmitError("Please sign in again to post a review.");
      setSubmitting(false);
      return;
    }
    const { client, session, userId } = context;

    try {
      const nextTitle = title.trim();
      const nextBody = body.trim();
      const payload = {
        business_id: businessId,
        customer_id: userId,
        rating,
        title: nextTitle || "",
        body: nextBody || "",
      };

      logMutation("createReview", {
        stage: "start",
        businessId,
        sessionUserId: userId,
        hasAccessToken: Boolean(session?.access_token),
      });

      const { data, error } = await client
        .from("business_reviews")
        .insert(payload)
        .select(REVIEW_SELECT_BASE)
        .single();

      if (error) {
        logMutation("createReview", { stage: "error", error: error?.message || error });
        throw error;
      }
      if (!data) {
        const emptyError = new Error("Review submission failed");
        logMutation("createReview", { stage: "empty_result", error: emptyError.message });
        throw emptyError;
      }

      if (data) {
        const [enriched] = await attachReviewAuthorProfiles(client, [data]);
        setReviews((prev) => [mergePublicBusinessReview(null, enriched || data), ...prev]);
        setCustomerReviewId(data.id);
        setSummary((prev) => {
          const base = normalizeSummary(prev, reviews);
          const count = base.count || 0;
          const nextCount = count + 1;
          const nextAverage = nextCount
            ? (base.average * count + rating) / nextCount
            : rating;
          return {
            count: nextCount,
            average: nextAverage,
            breakdown: {
              ...base.breakdown,
              [rating]: (base.breakdown?.[rating] || 0) + 1,
            },
          };
        });
      }

      setRating(0);
      setTitle("");
      setBody("");
      setSubmitSuccess("Thanks for sharing your review!");
      logMutation("createReview", { stage: "success", reviewId: data.id });
    } catch (err) {
      console.error("Failed to submit review", err);
      setSubmitError(err?.message || "Could not submit review yet.");
      logMutation("createReview", { stage: "exception", error: err?.message || String(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const startEditing = (review) => {
    setEditingReviewId(review.id);
    setEditRating(Number(review.rating || 0));
    setEditTitle(review.title || "");
    setEditBody(review.body || "");
    setEditError("");
  };

  const cancelEditing = () => {
    setEditingReviewId(null);
    setEditRating(0);
    setEditTitle("");
    setEditBody("");
    setEditError("");
  };

  const handleUpdateReview = async (reviewId) => {
    if (!businessId || editLoading) return;
    if (!editRating) {
      setEditError("Select a star rating.");
      return;
    }

    setEditLoading(true);
    setEditError("");

    let context;
    try {
      context = await getAuthedContext("updateReview");
    } catch (err) {
      setEditError("Please sign in again to update your review.");
      setEditLoading(false);
      return;
    }
    const { client, session, userId } = context;

    try {
      const nextTitle = editTitle.trim();
      const nextBody = editBody.trim();
      const payload = {
        rating: editRating,
        title: nextTitle || "",
        body: nextBody || "",
      };

      logMutation("updateReview", {
        stage: "start",
        reviewId,
        sessionUserId: userId,
        hasAccessToken: Boolean(session?.access_token),
      });

      let { data, error } = await client
        .from("business_reviews")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", reviewId)
        .eq("customer_id", userId)
        .select(REVIEW_SELECT_WITH_UPDATED)
        .single();
      if (error && isMissingColumnError(error)) {
        ({ data, error } = await client
          .from("business_reviews")
          .update(payload)
          .eq("id", reviewId)
          .eq("customer_id", userId)
          .select(REVIEW_SELECT_BASE)
          .single());
      }

      if (error) {
        logMutation("updateReview", { stage: "error", error: error?.message || error });
        throw error;
      }
      if (!data) {
        const emptyError = new Error("Review update failed");
        logMutation("updateReview", { stage: "empty_result", error: emptyError.message });
        throw emptyError;
      }

      if (data) {
        const [enriched] = await attachReviewAuthorProfiles(client, [data]);
        setReviews((prev) =>
          prev.map((item) =>
            item.id === reviewId
              ? mergePublicBusinessReview(item, enriched || data)
              : item
          )
        );
        setSummary((prev) => {
          const base = normalizeSummary(prev, reviews);
          const existing = reviews.find((item) => item.id === reviewId);
          if (!existing) return base;
          const nextBreakdown = { ...base.breakdown };
          const prevRating = Number(existing.rating || 0);
          if (prevRating >= 1 && prevRating <= 5) {
            nextBreakdown[prevRating] = Math.max(
              0,
              (nextBreakdown[prevRating] || 0) - 1
            );
          }
          nextBreakdown[editRating] = (nextBreakdown[editRating] || 0) + 1;
          const count = base.count || reviews.length;
          const nextAverage = count
            ? (base.average * count - prevRating + editRating) / count
            : editRating;
          return {
            count,
            average: nextAverage,
            breakdown: nextBreakdown,
          };
        });
      }

      cancelEditing();
      logMutation("updateReview", { stage: "success", reviewId });
    } catch (err) {
      console.error("Failed to update review", err);
      setEditError(err?.message || "Could not update review yet.");
      logMutation("updateReview", { stage: "exception", error: err?.message || String(err) });
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteReview = async (reviewId) => {
    if (!businessId || editLoading) return;
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Delete this review?");
      if (!confirmed) return;
    }

    setEditLoading(true);
    setEditError("");

    let context;
    try {
      context = await getAuthedContext("deleteReview");
    } catch (err) {
      setEditError("Please sign in again to delete your review.");
      setEditLoading(false);
      return;
    }
    const { client, session, userId } = context;

    try {
      const target = reviews.find((item) => item.id === reviewId);
      logMutation("deleteReview", {
        stage: "start",
        reviewId,
        sessionUserId: userId,
        hasAccessToken: Boolean(session?.access_token),
      });

      const { data, error } = await client
        .from("business_reviews")
        .delete()
        .eq("id", reviewId)
        .eq("customer_id", userId)
        .select("id");

      if (error) {
        logMutation("deleteReview", { stage: "error", error: error?.message || error });
        throw error;
      }
      if (!data || data.length === 0) {
        const emptyError = new Error("Review delete failed");
        logMutation("deleteReview", { stage: "empty_result", error: emptyError.message });
        throw emptyError;
      }

      setReviews((prev) => prev.filter((item) => item.id !== reviewId));
      setSummary((prev) => {
        const base = normalizeSummary(prev, reviews);
        const ratingValue = Number(target?.rating || 0);
        if (!ratingValue) return base;
        const nextBreakdown = { ...base.breakdown };
        nextBreakdown[ratingValue] = Math.max(
          0,
          (nextBreakdown[ratingValue] || 0) - 1
        );
        const count = Math.max(0, (base.count || 0) - 1);
        const nextAverage = count
          ? (base.average * (base.count || 1) - ratingValue) / count
          : 0;
        return { count, average: nextAverage, breakdown: nextBreakdown };
      });

      if (customerReviewId === reviewId) {
        setCustomerReviewId(null);
      }
      if (editingReviewId === reviewId) {
        cancelEditing();
      }
      logMutation("deleteReview", { stage: "success", reviewId });
    } catch (err) {
      console.error("Failed to delete review", err);
      setEditError(err?.message || "Could not delete review yet.");
      logMutation("deleteReview", { stage: "exception", error: err?.message || String(err) });
    } finally {
      setEditLoading(false);
    }
  };

  const handleOwnerDeleteReview = async (reviewId) => {
    if (!businessId || ownerDeleteLoadingId) return;
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Delete this review from your business profile?");
      if (!confirmed) return;
    }

    setOwnerDeleteLoadingId(reviewId);
    setOwnerDeleteError("");

    try {
      const response = await fetch(`/api/business/reviews/${reviewId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Could not delete review yet.");
      }

      await refreshVisibleReviews(payload?.ratingSummary);
    } catch (err) {
      console.error("Failed to delete business review", err);
      setOwnerDeleteError(err?.message || "Could not delete review yet.");
    } finally {
      setOwnerDeleteLoadingId(null);
    }
  };

  const isBusinessViewer = viewer.isBusiness;
  const isOwnBusiness = Boolean(
    isBusinessViewer && viewer.user?.id && businessId && viewer.user.id === businessId
  );
  const showReviewForm = viewer.isCustomer && !customerReviewId;
  const showLoginPrompt = viewer.status === "guest";
  const showBusinessNote = isBusinessViewer;

  const orderedReviews = useMemo(() => {
    if (!customerId) return reviews;
    const mine = [];
    const others = [];
    reviews.forEach((review) => {
      if (review.customer_id === customerId) {
        mine.push(review);
      } else {
        others.push(review);
      }
    });
    return [...mine, ...others];
  }, [reviews, customerId]);

  const resolveReviewerName = (review) => {
    const profile =
      review?.author_profile ||
      (review?.customer_id ? customerProfiles[review.customer_id] : null);
    return getReviewAuthorDisplayName({
      ...review,
      author_profile: profile,
    });
  };

  useEffect(() => {
    if (!reportToast) return undefined;
    const timeoutId = setTimeout(() => setReportToast(null), 5000);
    return () => clearTimeout(timeoutId);
  }, [reportToast]);

  return (
    <section
      id="reviews"
      className={`scroll-mt-40 border-t border-slate-100 pt-8 md:pt-10 ${className}`}
    >
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-[1.28rem] font-semibold tracking-[-0.03em] text-slate-950">Reviews</h2>
          <p className="mt-1 text-sm text-slate-600">What customers are saying about this business.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-[14px] border border-slate-100 bg-white px-3 py-2 shadow-sm">
            <Star className="h-5 w-5 text-amber-500" fill="currentColor" />
            <div>
              <div className="text-base font-semibold text-slate-950">
                {averageRating ? averageRating.toFixed(1) : "0.0"}
              </div>
              <div className="text-xs text-slate-500">
                {totalReviews <= 1
                  ? `${totalReviews || 0} review`
                  : `${totalReviews} reviews`}
              </div>
            </div>
          </div>
          <p className="text-sm text-slate-500">
            {totalReviews > 1
              ? "Average across all submitted reviews."
              : "A fuller rating picture will appear as more reviews come in."}
          </p>
        </div>
      </div>

      {shouldShowDistribution ? (
        <div className="mt-3 grid gap-2">
          {ratingRows.map((row) => (
            <div key={row.value} className="flex items-center gap-3 text-sm">
              <span className="w-8 text-slate-500">{row.value}★</span>
              <div className="h-2 flex-1 rounded-full bg-slate-200">
                <div
                  className="h-2 rounded-full bg-[#6a3df0]"
                  style={{ width: `${row.percent}%` }}
                />
              </div>
              <span className="w-10 text-right text-slate-500">{row.count}</span>
            </div>
          ))}
        </div>
      ) : null}

      {showReviewForm ? (
        <form
          onSubmit={handleSubmitReview}
          className="mt-4 space-y-3 rounded-[16px] border border-slate-100 bg-white p-3.5 shadow-sm"
        >
          <div>
            <p className="text-sm font-semibold text-slate-950">Leave a review</p>
            <p className="text-xs text-slate-500">
              Share your experience to help neighbors decide.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                className="p-1"
                aria-label={`Rate ${value} star${value === 1 ? "" : "s"}`}
              >
                <Star
                  className={`h-5 w-5 ${
                    value <= rating ? "text-amber-500" : "text-slate-300"
                  }`}
                  fill={value <= rating ? "currentColor" : "none"}
                />
              </button>
            ))}
          </div>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title (optional)"
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 md:text-sm"
            maxLength={80}
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write your review (optional)"
            className="w-full min-h-[104px] rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 md:text-sm"
            maxLength={800}
          />
          {submitError ? (
            <p className="text-xs text-rose-600">{submitError}</p>
          ) : null}
          {submitSuccess ? (
            <p className="text-xs text-emerald-600">{submitSuccess}</p>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="dashboard-primary-action inline-flex items-center justify-center rounded-full bg-[#6E34FF] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#5E2DE0] disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Post review"}
          </button>
        </form>
      ) : null}

      {!showReviewForm && showLoginPrompt ? (
        <div className="mt-4 rounded-[16px] border border-slate-100 bg-white p-3.5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">
                Sign in to write a review
              </p>
              <p className="text-xs text-slate-500">
                Join as a customer to share your experience.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openModal("customer-login")}
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Sign in
            </button>
          </div>
        </div>
      ) : null}

      {!showReviewForm && showBusinessNote && !isOwnerMode ? (
        <div className="mt-4 rounded-[16px] border border-slate-100 bg-white p-3.5 text-xs text-slate-500 shadow-sm">
          {isOwnBusiness
            ? "Business owners can’t review their own business."
            : "Business accounts can’t leave reviews."}
        </div>
      ) : null}

      {ownerDeleteError ? (
        <div className="mt-4 rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {ownerDeleteError}
        </div>
      ) : null}

      {!reviews.length && !loading ? (
        <div className="mt-4">
          <div className="rounded-[16px] border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-slate-50 p-2 text-[#6a3df0]">
                <MessageSquareQuote className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">No reviews yet</p>
                <p className="mt-1 text-sm text-slate-500">
                  Customer feedback will appear here once someone shares their experience.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 2 }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-[16px] border border-slate-100 bg-white p-4 shadow-sm"
            >
              <div className="h-4 w-32 rounded bg-slate-200" />
              <div className="mt-3 h-3 w-24 rounded bg-slate-200" />
              <div className="mt-4 h-3 w-full rounded bg-slate-200" />
              <div className="mt-2 h-3 w-4/5 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      ) : reviews.length ? (
        <div className="mt-4 space-y-3">
          {orderedReviews.map((review) => (
            <div
              key={review.id}
              className="rounded-[16px] border border-slate-100 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    {resolveReviewerName(review)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {review.created_at ? formatDate(review.created_at) : ""}
                    {review.updated_at &&
                    review.updated_at !== review.created_at
                      ? ` · Edited ${formatDate(review.updated_at)}`
                      : ""}
                  </p>
                  {review.title ? (
                    <p className="mt-1 text-xs text-slate-500">{review.title}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1 text-amber-500">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Star
                      key={idx}
                      className={`h-4 w-4 ${
                        idx < (review.rating || 0)
                          ? "text-amber-500"
                          : "text-amber-200"
                      }`}
                      fill={idx < (review.rating || 0) ? "currentColor" : "none"}
                    />
                  ))}
                </div>
              </div>
              {editingReviewId === review.id ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setEditRating(value)}
                        className="p-1"
                        aria-label={`Rate ${value} star${value === 1 ? "" : "s"}`}
                        >
                          <Star
                            className={`h-5 w-5 ${
                              value <= editRating
                                ? "text-amber-500"
                                : "text-slate-300"
                            }`}
                            fill={value <= editRating ? "currentColor" : "none"}
                          />
                        </button>
                      ))}
                  </div>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    placeholder="Title (optional)"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 md:text-sm"
                    maxLength={80}
                  />
                  <textarea
                    value={editBody}
                    onChange={(event) => setEditBody(event.target.value)}
                    placeholder="Write your review (optional)"
                    className="w-full min-h-[104px] rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 md:text-sm"
                    maxLength={800}
                  />
                  {editError ? (
                    <p className="text-xs text-rose-600">{editError}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateReview(review.id)}
                      disabled={editLoading}
                      className="dashboard-primary-action inline-flex items-center justify-center rounded-full bg-[#6E34FF] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#5E2DE0] disabled:opacity-60"
                    >
                      {editLoading ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {review.body ? (
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {review.body}
                    </p>
                  ) : null}
                  {review.business_reply ? (
                    <div className="mt-3 rounded-[14px] border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        {`Reply from ${businessName}`}
                      </p>
                      {review.business_reply_at ? (
                        <p className="mt-1 text-[11px] text-slate-400">
                          {formatDate(review.business_reply_at)}
                        </p>
                      ) : null}
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        {review.business_reply}
                      </p>
                    </div>
                  ) : null}
                  {isOwnerMode ? (
                    <>
                      {replyReviewId === review.id ? (
                        <div className="mt-4 space-y-3 rounded-[14px] border border-slate-100 bg-slate-50/80 p-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              Reply as business
                            </p>
                          </div>
                          <textarea
                            value={replyBody}
                            onChange={(event) => setReplyBody(event.target.value)}
                            placeholder="Write a reply"
                            className="w-full min-h-[96px] rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 md:text-sm"
                            maxLength={800}
                          />
                          {replyError ? (
                            <p className="text-xs text-rose-600">{replyError}</p>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveBusinessReply(review)}
                              disabled={replyLoading}
                              className="dashboard-primary-action inline-flex items-center justify-center rounded-full bg-[#6E34FF] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#5E2DE0] disabled:opacity-60"
                            >
                              {replyLoading ? "Saving..." : review.business_reply ? "Save reply" : "Post reply"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelReply}
                              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                            {review.business_reply ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteBusinessReply(review)}
                                disabled={replyLoading}
                                className="inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60"
                              >
                                Remove reply
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startReply(review)}
                          disabled={replyLoading && replyReviewId === review.id}
                          className="inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60"
                        >
                          <MessageSquareText className="mr-1.5 h-3.5 w-3.5" />
                          {review.business_reply ? "Edit reply" : "Reply"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOwnerDeleteReview(review.id)}
                          disabled={ownerDeleteLoadingId === review.id}
                          className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:opacity-60"
                        >
                          {ownerDeleteLoadingId === review.id ? "Deleting..." : "Delete review"}
                        </button>
                      </div>
                    </>
                  ) : customerId && review.customer_id === customerId ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                      type="button"
                      onClick={() => startEditing(review)}
                      className="inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteReview(review.id)}
                      className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      Delete
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 flex items-center gap-2 text-sm">
                    <button
                      type="button"
                      className="text-slate-400 transition hover:text-slate-600"
                      aria-label="Mark review as helpful"
                      onClick={() => {}}
                    >
                      Helpful
                    </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => {
                          setReportTarget(review);
                        }}
                        className="text-slate-400 transition hover:text-slate-600 hover:underline"
                      >
                        Report
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {canLoadMore ? (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="mt-4 inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          {loadingMore ? "Loading..." : "Load more reviews"}
        </button>
      ) : null}
      <ReportModal
        open={Boolean(reportTarget)}
        onClose={() => setReportTarget(null)}
        targetType="review"
        targetId={reportTarget?.id}
        targetLabel={reportTarget?.title || reportTarget?.body || "Review"}
        meta={{
          review_id: reportTarget?.id || null,
          business_id: businessId || null,
        }}
        onSubmitted={(payload) => {
          setReportToast(payload?.message || "Thanks - your report has been received.");
        }}
      />
      {reportToast ? (
        <div className="fixed bottom-6 left-6 z-50">
          <div className="rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-900 shadow-xl">
            {reportToast}
          </div>
        </div>
      ) : null}
    </section>
  );
}
