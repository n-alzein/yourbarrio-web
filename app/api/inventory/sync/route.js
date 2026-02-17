import { NextResponse } from "next/server";
import { getBusinessDataClientForRequest } from "@/lib/business/getBusinessDataClientForRequest";
import { perfLog, perfTimer } from "@/lib/perf";

const allowedFields = new Set([
  "inventory_status",
  "inventory_quantity",
  "low_stock_threshold",
]);

function sanitizeUpdates(updates) {
  if (!updates || typeof updates !== "object") return {};
  return Object.keys(updates).reduce((acc, key) => {
    if (allowedFields.has(key)) {
      acc[key] = updates[key];
    }
    return acc;
  }, {});
}

export async function POST(request) {
  const access = await getBusinessDataClientForRequest();
  if (!access.ok) {
    return NextResponse.json({ error: access.error || "forbidden" }, { status: access.status || 403 });
  }
  const supabase = access.client;
  const businessUserId = access.effectiveUserId;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const listingId = body?.listingId;
  const updates = sanitizeUpdates(body?.updates);

  if (
    !listingId ||
    typeof listingId !== "string" ||
    listingId === "undefined" ||
    listingId === "null"
  ) {
    return NextResponse.json({ error: "missing_listing_id" }, { status: 400 });
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const stopTimer = perfTimer("inventory_job_sync");
  try {
    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .select("id, business_id")
      .eq("id", listingId)
      .eq("business_id", businessUserId)
      .maybeSingle();

    if (listingError) {
      perfLog("inventory sync listing lookup failed", listingError);
      return NextResponse.json({ error: "listing_lookup_failed" }, { status: 500 });
    }

    if (!listing) {
      return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
    }

    const { data: existingJobs } = await supabase
      .from("inventory_jobs")
      .select("id, status, listing_id")
      .eq("business_id", businessUserId)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1);

    const existing = Array.isArray(existingJobs) ? existingJobs[0] : null;
    if (existing?.id) {
      return NextResponse.json({
        jobId: existing.id,
        listingId: existing.listing_id,
        status: existing.status,
        reused: true,
      });
    }

    const { data: job, error: jobError } = await supabase
      .from("inventory_jobs")
      .insert({
        business_id: businessUserId,
        listing_id: listingId,
        status: "queued",
        progress: 0,
        payload: updates,
      })
      .select("id")
      .single();

    if (jobError) {
      perfLog("inventory job insert failed", jobError);
      return NextResponse.json({ error: "job_create_failed" }, { status: 500 });
    }

    return NextResponse.json({ jobId: job.id, listingId });
  } finally {
    stopTimer();
  }
}
