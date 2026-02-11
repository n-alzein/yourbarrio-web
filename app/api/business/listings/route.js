import { NextResponse } from "next/server";
import { getBusinessDataClientForRequest } from "@/lib/business/getBusinessDataClientForRequest";
import { isUuid } from "@/lib/ids/isUuid";

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
      .select("*, category_info:business_categories(name,slug)")
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

    const response = NextResponse.json({ listing: data }, { status: 200 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const { data, error } = await supabase
    .from("listings")
    .select("*, category_info:business_categories(name,slug)")
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
