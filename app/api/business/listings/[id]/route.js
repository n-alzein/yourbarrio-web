import { NextResponse } from "next/server";
import { getBusinessDataClientForRequest } from "@/lib/business/getBusinessDataClientForRequest";
import { getListingVariants } from "@/lib/listingOptions";

async function getRouteListingId(params) {
  const resolvedParams = typeof params?.then === "function" ? await params : params;
  return resolvedParams?.id;
}

function getDeleteErrorResponse(error) {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "").trim();

  if (code === "23503") {
    return {
      body: {
        error:
          "This listing is linked to existing cart, order, or inventory reservation records. Unpublish it instead, or contact support to archive it safely.",
        code,
      },
      status: 409,
    };
  }

  return {
    body: {
      error: message || "Failed to delete listing",
      code: code || null,
    },
    status: 500,
  };
}

async function archiveListing({ supabase, listingId, effectiveUserId }) {
  const archivePayloadWithTimestamp = {
    admin_hidden: true,
    deleted_at: new Date().toISOString(),
    status: "draft",
  };

  const result = await supabase
    .from("listings")
    .update(archivePayloadWithTimestamp)
    .eq("id", listingId)
    .eq("business_id", effectiveUserId);

  const errorCode = String(result.error?.code || "").trim();
  if (errorCode !== "PGRST204") {
    return { error: result.error };
  }

  const fallbackResult = await supabase
    .from("listings")
    .update({
      admin_hidden: true,
      status: "draft",
    })
    .eq("id", listingId)
    .eq("business_id", effectiveUserId);

  return { error: fallbackResult.error };
}

export async function GET(request, { params }) {
  const access = await getBusinessDataClientForRequest();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const supabase = access.client;
  const effectiveUserId = access.effectiveUserId;

  const listingId = await getRouteListingId(params);
  if (!listingId) {
    return NextResponse.json({ error: "Missing listing id" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("id", listingId)
    .eq("business_id", effectiveUserId)
    .eq("admin_hidden", false)
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

  const listingOptions = await getListingVariants(supabase, data.id);
  const response = NextResponse.json({ listing: data, listingOptions }, { status: 200 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function DELETE(request, { params }) {
  const access = await getBusinessDataClientForRequest();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const supabase = access.client;
  const effectiveUserId = access.effectiveUserId;

  const listingId = await getRouteListingId(params);
  if (!listingId) {
    return NextResponse.json({ error: "Missing listing id" }, { status: 400 });
  }

  const { data: listing, error: lookupError } = await supabase
    .from("listings")
    .select("id")
    .eq("id", listingId)
    .eq("business_id", effectiveUserId)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json(
      { error: lookupError.message || "Failed to load listing" },
      { status: 500 }
    );
  }

  if (!listing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error: deleteError } = await supabase
    .from("listings")
    .delete()
    .eq("id", listing.id)
    .eq("business_id", effectiveUserId);

  if (deleteError) {
    if (String(deleteError?.code || "").trim() === "23503") {
      const archiveResult = await archiveListing({
        supabase,
        listingId: listing.id,
        effectiveUserId,
      });

      if (!archiveResult.error) {
        const response = NextResponse.json({ ok: true, archived: true }, { status: 200 });
        response.headers.set("Cache-Control", "no-store");
        return response;
      }
    }

    const response = getDeleteErrorResponse(deleteError);
    return NextResponse.json(response.body, { status: response.status });
  }

  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
