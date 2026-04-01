"use client";

import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { logMutation } from "@/lib/auth/requireSession";
import { getAuthedContext } from "@/lib/auth/getAuthedContext";
import { useAuth } from "@/components/AuthProvider";
import { useModal } from "@/components/modals/ModalProvider";
import { useViewerContext } from "@/components/public/ViewerContextEnhancer";
import ReportModal from "@/components/moderation/ReportModal";

function formatReviewer(id) {
  if (!id) return "Customer";
  return `Customer ${id.slice(0, 6)}`;
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return "";
  }
}

function isMissingColumnError(error) {
  if (!error) return false;
  if (error?.code === "42703") return true;
  return /column "([^"]+)" does not exist/i.test(error?.message || "");
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
  }
  return true;
}

export default function BusinessReviewsPanel({
  businessId,
  initialReviews,
  ratingSummary,
  reviewCount,
  loading = false,
  className = "",
}) {
  const { supabase } = useAuth();
  const { openModal } = useModal();
  const viewer = useViewerContext();
  const [reviews, setReviews] = useState(initialReviews || []);
  const [summary, setSummary] = useState(() => normalizeSummary(ratingSummary, []));
  const [loadingMore, setLoadingMore] = useState(false);
  const [customerNames, setCustomerNames] = useState({});
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

  const customerId = viewer.user?.id || null;

  const reviewAverage = reviews.length
    ? reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0) /
      reviews.length
    : 0;
  const averageRating = summary?.count ? summary.average : reviewAverage;
  const totalReviews = Math.max(
    summary?.count ?? 0,
    reviewCount ?? 0,
    reviews.length
  );
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

  const handleLoadMore = async () => {
    if (!businessId || loadingMore) return;
    setLoadingMore(true);

    const client = getSupabaseBrowserClient();
    if (!client) {
      setLoadingMore(false);
      return;
    }

    const from = reviews.length;
    const to = from + pageSize - 1;
    const reviewsSelectBase =
      "id,business_id,customer_id,rating,title,body,created_at,business_reply,business_reply_at";
    const reviewsSelectWithUpdated = `${reviewsSelectBase},updated_at`;
    let { data, error } = await client
      .from("business_reviews")
      .select(reviewsSelectWithUpdated)
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error && isMissingColumnError(error)) {
      ({ data, error } = await client
        .from("business_reviews")
        .select(reviewsSelectBase)
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .range(from, to));
    }

    if (!error && data?.length) {
      setReviews((prev) => [...prev, ...data]);
    }

    setLoadingMore(false);
  };

  useEffect(() => {
    if (Array.isArray(initialReviews)) {
      setReviews((prev) =>
        isSameReviewList(prev, initialReviews) ? prev : initialReviews
      );
    }
  }, [initialReviews]);

  useEffect(() => {
    setSummary((prev) => normalizeSummary(ratingSummary, reviews) || prev);
  }, [ratingSummary, reviews]);

  useEffect(() => {
    let active = true;
    if (!businessId || !customerId) {
      setCustomerReviewId(null);
      return () => {};
    }

    const loadCustomerReview = async () => {
      const client = supabase ?? getSupabaseBrowserClient();
      if (!client) return;
      const reviewsSelectBase =
        "id,business_id,customer_id,rating,title,body,created_at,business_reply,business_reply_at";
      const reviewsSelectWithUpdated = `${reviewsSelectBase},updated_at`;
      let { data, error } = await client
        .from("business_reviews")
        .select(reviewsSelectWithUpdated)
        .eq("business_id", businessId)
        .eq("customer_id", customerId)
        .maybeSingle();
      if (error && isMissingColumnError(error)) {
        ({ data, error } = await client
          .from("business_reviews")
          .select(reviewsSelectBase)
          .eq("business_id", businessId)
          .eq("customer_id", customerId)
          .maybeSingle());
      }

      if (!active) return;
      if (!error && data) {
        setCustomerReviewId(data.id);
        setReviews((prev) => {
          if (prev.some((item) => item.id === data.id)) return prev;
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
    const missing = ids.filter((id) => !customerNames[id]);
    if (!missing.length) return () => {};

    const loadNames = async () => {
      const client = supabase ?? getSupabaseBrowserClient();
      if (!client) return;
      const { data, error } = await client
        .from("users")
        .select("id,full_name,business_name")
        .in("id", missing);

      if (!active || error || !data?.length) return;
      setCustomerNames((prev) => {
        const next = { ...prev };
        data.forEach((row) => {
          next[row.id] = row.full_name || row.business_name || "Customer";
        });
        return next;
      });
    };

    loadNames();
    return () => {
      active = false;
    };
  }, [reviews, customerNames, supabase]);

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
        .select(
          "id,business_id,customer_id,rating,title,body,created_at,business_reply,business_reply_at"
        )
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
        setReviews((prev) => [data, ...prev]);
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
        .select(
          "id,business_id,customer_id,rating,title,body,created_at,updated_at,business_reply,business_reply_at"
        )
        .single();
      if (error && isMissingColumnError(error)) {
        ({ data, error } = await client
          .from("business_reviews")
          .update(payload)
          .eq("id", reviewId)
          .eq("customer_id", userId)
          .select(
            "id,business_id,customer_id,rating,title,body,created_at,business_reply,business_reply_at"
          )
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
        setReviews((prev) => prev.map((item) => (item.id === reviewId ? data : item)));
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

  useEffect(() => {
    if (!reportToast) return undefined;
    const timeoutId = setTimeout(() => setReportToast(null), 5000);
    return () => clearTimeout(timeoutId);
  }, [reportToast]);

  return (
    <section
      id="reviews"
      className={`scroll-mt-40 rounded-[28px] border border-slate-200/80 bg-white/92 p-5 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.28)] backdrop-blur md:p-6 ${className}`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-[1.4rem] font-semibold tracking-[-0.02em] text-slate-950">Reviews</h2>
          <p className="text-sm text-slate-600">What customers are saying.</p>
        </div>
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-amber-500" fill="currentColor" />
          <span className="text-2xl font-semibold text-slate-950">
            {averageRating ? averageRating.toFixed(1) : "0.0"}
          </span>
          <span className="text-sm text-slate-500">
            ({totalReviews} total)
          </span>
        </div>
      </div>

      {shouldShowDistribution ? (
        <div className="mt-4 grid gap-2">
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
          className="mt-4 rounded-[20px] bg-slate-50/75 p-4 space-y-3"
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
        <div className="mt-4 rounded-[20px] bg-slate-50/75 p-4">
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

      {!showReviewForm && showBusinessNote ? (
        <div className="mt-4 rounded-[20px] bg-slate-50/75 p-4 text-xs text-slate-500">
          {isOwnBusiness
            ? "Business owners can’t review their own business."
            : "Business accounts can’t leave reviews."}
        </div>
      ) : null}

      {!reviews.length && !loading ? (
        <div className="mt-4 rounded-[20px] border border-dashed border-slate-200/90 bg-slate-50/70 p-4 text-sm text-slate-500">
          No reviews yet.
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 2 }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-[20px] bg-slate-50/75 p-4"
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
              className="rounded-[20px] bg-slate-50/75 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    {customerNames[review.customer_id] ||
                      formatReviewer(review.customer_id)}
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
                    <p className="mt-2.5 text-sm leading-6 text-slate-600">
                      {review.body}
                    </p>
                  ) : null}
                  {review.business_reply ? (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Reply from business
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
                  {customerId && review.customer_id === customerId ? (
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
