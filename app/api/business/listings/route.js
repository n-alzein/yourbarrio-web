import { NextResponse } from "next/server";
import { getBusinessDataClientForRequest } from "@/lib/business/getBusinessDataClientForRequest";
import { getOwnedListingEditorData } from "@/lib/business/getOwnedListingEditorData";

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
    const result = await getOwnedListingEditorData({
      supabase,
      effectiveUserId,
      listingRef,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const response = NextResponse.json(
      {
        listing: result.listing,
        listingOptions: result.listingOptions,
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
    .eq("admin_hidden", false)
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
