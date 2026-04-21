import { NextResponse } from "next/server";
import { getSupabaseServerClient, getUserCached } from "@/lib/supabaseServer";
import { isUuid } from "@/lib/ids/isUuid";
import { getPublicBusinessByOwnerId } from "@/lib/business/getPublicBusinessByOwnerId";
import { withListingPricing } from "@/lib/pricing";

export async function GET(request) {
  const supabase = await getSupabaseServerClient();
  const { user, error: userError } = await getUserCached(supabase);

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const listingRef = (searchParams.get("id") || "").trim();

  if (!listingRef) {
    return NextResponse.json({ error: "Missing listing id" }, { status: 400 });
  }

  const { data: resolvedRows, error: resolveError } = await supabase.rpc("resolve_listing_ref", {
    p_ref: listingRef,
  });
  const resolvedRow = Array.isArray(resolvedRows) ? resolvedRows[0] : null;
  const resolvedListingId =
    resolvedRow?.id || (isUuid(listingRef) ? listingRef : null);

  if (resolveError || !resolvedListingId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("*")
    .eq("id", resolvedListingId)
    .maybeSingle();

  if (listingError) {
    return NextResponse.json(
      { error: listingError.message || "Failed to load listing" },
      { status: 500 }
    );
  }

  if (!listing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const business = await getPublicBusinessByOwnerId(listing.business_id);
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isBusiness = String(profile?.role || "").trim().toLowerCase() === "business";
  const { data: saved } = isBusiness
    ? { data: null }
    : await supabase
        .from("saved_listings")
        .select("id")
        .eq("user_id", user.id)
        .eq("listing_id", resolvedListingId)
        .maybeSingle();

  const response = NextResponse.json(
    {
      listing: withListingPricing(listing),
      business,
      isSaved: Boolean(saved),
    },
    { status: 200 }
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
