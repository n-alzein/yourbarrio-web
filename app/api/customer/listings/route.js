import { NextResponse } from "next/server";
import { getSupabaseServerClient, getUserCached } from "@/lib/supabaseServer";
import { isUuid } from "@/lib/ids/isUuid";
import { getPublicBusinessByOwnerId } from "@/lib/business/getPublicBusinessByOwnerId";
import { withListingPricing } from "@/lib/pricing";
import { getListingVariants } from "@/lib/listingOptions";

export async function GET(request) {
  try {
    const supabase = await getSupabaseServerClient();
    const { user } = await getUserCached(supabase);
    const { searchParams } = new URL(request.url);
    const listingRef = (searchParams.get("id") || "").trim();

    if (!listingRef) {
      return NextResponse.json({ error: "Missing listing id" }, { status: 400 });
    }

    const { data: resolvedRows, error: resolveError } = await supabase.rpc("resolve_listing_ref", {
      p_ref: listingRef,
    });
    const resolvedRow = Array.isArray(resolvedRows) ? resolvedRows[0] : null;
    const resolvedListingId = resolvedRow?.id || (isUuid(listingRef) ? listingRef : null);

    if (resolveError) {
      console.error("[public listings error]", resolveError);
      console.log("[public listings]", { count: 0 });
      const response = NextResponse.json(
        { listing: null, business: null, isSaved: false, listingOptions: null },
        { status: 200 }
      );
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    if (!resolvedListingId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: listing, error: listingError } = await supabase
      .from("public_listings_v")
      .select("*")
      .eq("id", resolvedListingId)
      .maybeSingle();

    if (listingError) {
      console.error("[public listings error]", listingError);
      console.log("[public listings]", { count: 0 });
      const response = NextResponse.json(
        { listing: null, business: null, isSaved: false, listingOptions: null },
        { status: 200 }
      );
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    if (!listing) {
      console.log("[public listings]", { count: 0 });
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const business = await getPublicBusinessByOwnerId(listing.business_id);
    if (!business) {
      console.log("[public listings]", { count: 1 });
      const response = NextResponse.json(
        {
          listing: withListingPricing(listing),
          business: null,
          isSaved: false,
          listingOptions: null,
        },
        { status: 200 }
      );
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    let isSaved = false;
    if (user?.id) {
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      const isBusiness = String(profile?.role || "").trim().toLowerCase() === "business";
      if (!isBusiness) {
        const { data: saved } = await supabase
          .from("saved_listings")
          .select("id")
          .eq("user_id", user.id)
          .eq("listing_id", resolvedListingId)
          .maybeSingle();
        isSaved = Boolean(saved);
      }
    }

    let listingOptions = null;
    try {
      listingOptions = await getListingVariants(supabase, resolvedListingId);
    } catch (error) {
      console.error("[public listings error]", error);
    }

    console.log("[public listings]", { count: 1 });
    const response = NextResponse.json(
      {
        listing: withListingPricing(listing),
        business,
        isSaved,
        listingOptions,
      },
      { status: 200 }
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (e) {
    console.error("[public listings fatal]", e);
    console.log("[public listings]", { count: 0 });
    const response = NextResponse.json(
      { listing: null, business: null, isSaved: false, listingOptions: null },
      { status: 200 }
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
