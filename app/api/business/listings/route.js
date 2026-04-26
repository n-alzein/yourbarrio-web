import { NextResponse } from "next/server";
import { getBusinessDataClientForRequest } from "@/lib/business/getBusinessDataClientForRequest";
import { isUuid } from "@/lib/ids/isUuid";
import { getListingVariants } from "@/lib/listingOptions";
import { applyListingDraftDataToListing } from "@/lib/listingEditor";

export async function GET(request) {
  const access = await getBusinessDataClientForRequest();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const supabase = access.client;
  const effectiveUserId = access.effectiveUserId;

  const { searchParams } = new URL(request.url);
  const listingRef = (searchParams.get("id") || "").trim();

  if (listingRef) {
    const field = isUuid(listingRef) ? "id" : "public_id";
    const { data, error } = await supabase
      .from("listings")
      .select("*")
      .eq(field, listingRef)
      .eq("business_id", effectiveUserId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to load listing" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const baseListingOptions = await getListingVariants(supabase, data.id);
    const draftOverlay =
      String(data.status || "").trim().toLowerCase() === "published" &&
      data.has_unpublished_changes === true
        ? applyListingDraftDataToListing(data, data.draft_data)
        : { listing: data, listingOptions: null };
    const response = NextResponse.json(
      {
        listing: draftOverlay.listing,
        listingOptions: draftOverlay.listingOptions || baseListingOptions,
      },
      { status: 200 }
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("business_id", effectiveUserId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to load listings" },
      { status: 500 }
    );
  }

  const response = NextResponse.json({ listings: data || [] }, { status: 200 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
