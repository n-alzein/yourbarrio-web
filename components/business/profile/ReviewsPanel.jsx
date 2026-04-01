"use client";

import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";

function formatReviewer(id) {
  if (!id) return "Customer";
  return `Customer ${id.slice(0, 6)}`;
}

async function ensureSession(client) {
  if (!client?.auth?.getSession) return null;
  const { data, error } = await client.auth.getSession();
  if (error || !data?.session) return null;
  return data.session;
}

export default function ReviewsPanel({
  reviews,
  setReviews,
  reviewCount,
  ratingSummary,
  tone,
  businessId,
  supabase,
}) {
  const [loadingMore, setLoadingMore] = useState(false);
  const [customerNames, setCustomerNames] = useState({});
  const [replyReviewId, setReplyReviewId] = useState(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyError, setReplyError] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);
  const pageSize = 6;

  const averageRating = ratingSummary?.average || 0;
  const isLowVolume = reviewCount < 5;
  const shouldShowDistribution = reviewCount >= 5;

  const canLoadMore = reviews.length < reviewCount;

  useEffect(() => {
    let active = true;
    if (!supabase) return () => {};

    const ids = Array.from(
      new Set(reviews.map((item) => item.customer_id).filter(Boolean))
    );
    const missing = ids.filter((id) => !customerNames[id]);
    if (!missing.length) return () => {};

    const loadNames = async () => {
      const { data, error } = await supabase
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

  const handleLoadMore = async () => {
    if (!supabase || loadingMore) return;
    setLoadingMore(true);

    const from = reviews.length;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("business_reviews")
      .select(
        "id,business_id,customer_id,rating,title,body,created_at,business_reply,business_reply_at"
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (!error && data?.length) {
      setReviews((prev) => [...prev, ...data]);
    }

    setLoadingMore(false);
  };

  const startReply = (review) => {
    setReplyReviewId(review.id);
    setReplyBody(review.business_reply || "");
    setReplyError("");
  };

  const cancelReply = () => {
    setReplyReviewId(null);
    setReplyBody("");
    setReplyError("");
  };

  const handleSaveReply = async (reviewId) => {
    if (!supabase || replyLoading) return;
    if (!replyBody.trim()) {
      setReplyError("Reply cannot be empty.");
      return;
    }

    setReplyLoading(true);
    setReplyError("");
    const session = await ensureSession(supabase);
    if (!session) {
      setReplyError("Please sign in again to reply.");
      setReplyLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("business_reviews")
      .update({
        business_reply: replyBody.trim(),
        business_reply_at: new Date().toISOString(),
      })
      .eq("id", reviewId)
      .select(
        "id,business_id,customer_id,rating,title,body,created_at,business_reply,business_reply_at"
      )
      .maybeSingle();

    if (error) {
      setReplyError(error.message || "Could not save reply.");
      setReplyLoading(false);
      return;
    }

    if (data) {
      setReviews((prev) => prev.map((item) => (item.id === reviewId ? data : item)));
      cancelReply();
    }

    setReplyLoading(false);
  };

  const handleDeleteReply = async (reviewId) => {
    if (!supabase || replyLoading) return;
    setReplyLoading(true);
    setReplyError("");
    const session = await ensureSession(supabase);
    if (!session) {
      setReplyError("Please sign in again to update this reply.");
      setReplyLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("business_reviews")
      .update({
        business_reply: null,
        business_reply_at: null,
      })
      .eq("id", reviewId)
      .select(
        "id,business_id,customer_id,rating,title,body,created_at,business_reply,business_reply_at"
      )
      .maybeSingle();

    if (error) {
      setReplyError(error.message || "Could not delete reply.");
      setReplyLoading(false);
      return;
    }

    if (data) {
      setReviews((prev) => prev.map((item) => (item.id === reviewId ? data : item)));
      cancelReply();
    }

    setReplyLoading(false);
  };

  const ratingRows = useMemo(() => {
    const total = ratingSummary?.count || reviewCount || 0;
    const breakdown = ratingSummary?.breakdown || {};
    return [5, 4, 3, 2, 1].map((value) => {
      const count = breakdown[value] || 0;
      const percent = total ? Math.round((count / total) * 100) : 0;
      return { value, count, percent };
    });
  }, [ratingSummary, reviewCount]);

  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white/92 p-5 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.28)] backdrop-blur md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-[1.4rem] font-semibold tracking-[-0.02em] text-slate-950">Reviews</h2>
            <p className="text-sm text-slate-600">Customer feedback with business replies.</p>
          </div>
          <div
            className={`flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50/80 ${
              isLowVolume ? "px-3.5 py-2" : "px-4 py-2.5"
            }`}
          >
            <Star className="h-5 w-5 text-amber-500" fill="currentColor" />
            <span className={isLowVolume ? "text-xl font-semibold text-slate-950" : "text-2xl font-semibold text-slate-950"}>
              {averageRating ? averageRating.toFixed(1) : "0.0"}
            </span>
            <span className="text-sm text-slate-500">
              ({reviewCount} total)
            </span>
          </div>
        </div>

        {shouldShowDistribution ? (
          <div className="mt-4 space-y-2">
            {ratingRows.map((row) => (
              <div key={row.value} className="flex items-center gap-3">
                <span className="w-8 text-xs text-slate-500">{row.value}★</span>
                <div className="h-2 flex-1 rounded-full bg-slate-200">
                  <div
                    className="h-2 rounded-full bg-[#6a3df0]"
                    style={{ width: `${row.percent}%` }}
                  />
                </div>
                <span className="w-10 text-right text-xs text-slate-500">{row.count}</span>
              </div>
            ))}
          </div>
        ) : null}

      {!reviews.length ? (
        <div className="mt-4 rounded-[20px] border border-dashed border-slate-200/90 bg-slate-50/70 px-4 py-4">
          <p className="text-sm font-medium text-slate-950">No reviews yet</p>
          <p className="mt-1 text-sm text-slate-500">Encourage customers to leave feedback once the storefront is live.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
          {reviews.map((review) => (
            <div key={review.id} className="rounded-[18px] bg-slate-50/75 p-3.5 md:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-950">
                    {customerNames[review.customer_id] ||
                      formatReviewer(review.customer_id)}
                  </p>
                  {review.title ? (
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {review.title}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-slate-500">
                    {new Date(review.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1 text-amber-500">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Star
                      key={idx}
                      className={`h-4 w-4 ${idx < review.rating ? "" : "text-amber-200"}`}
                      fill={idx < review.rating ? "currentColor" : "none"}
                    />
                  ))}
                </div>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{review.body}</p>
              {review.business_reply ? (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-400">
                    Reply from business
                  </p>
                  <p className="mt-1.5 text-sm leading-6 text-slate-600">{review.business_reply}</p>
                </div>
              ) : null}

              {replyReviewId === review.id ? (
                <div className="mt-3 space-y-2.5">
                  <textarea
                    value={replyBody}
                    onChange={(event) => setReplyBody(event.target.value)}
                    placeholder="Write a reply..."
                    className="w-full min-h-[100px] rounded-2xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 md:text-sm"
                    maxLength={800}
                  />
                  {replyError ? (
                    <p className="text-xs text-rose-600">{replyError}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSaveReply(review.id)}
                      disabled={replyLoading}
                      className="dashboard-primary-action rounded-full bg-[#6E34FF] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#5E2DE0]"
                    >
                      {replyLoading ? "Saving..." : "Save reply"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelReply}
                      className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    {review.business_reply ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteReply(review.id)}
                        className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                      >
                        Delete reply
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => startReply(review)}
                    className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    {review.business_reply ? "Edit reply" : "Reply"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canLoadMore ? (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="mt-4 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          {loadingMore ? "Loading..." : "Load more reviews"}
        </button>
      ) : null}
    </section>
  );
}
