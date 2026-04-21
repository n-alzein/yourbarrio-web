import { NextResponse } from "next/server";
import { getSupabaseServerClient, getUserCached } from "@/lib/supabaseServer";

async function getCustomerSaveAccess() {
  const supabase = await getSupabaseServerClient();
  const { user, error: userError } = await getUserCached(supabase);

  if (userError || !user?.id) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: profileError.message || "Unable to verify account role" },
        { status: 500 }
      ),
    };
  }

  if (String(profile?.role || "").trim().toLowerCase() === "business") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Business accounts cannot save listings." },
        { status: 403 }
      ),
    };
  }

  return { ok: true, supabase, user };
}

async function readListingId(request) {
  const body = await request.json().catch(() => ({}));
  return String(body?.listingId || "").trim();
}

export async function POST(request) {
  const access = await getCustomerSaveAccess();
  if (!access.ok) return access.response;

  const listingId = await readListingId(request);
  if (!listingId) {
    return NextResponse.json({ error: "Missing listing id" }, { status: 400 });
  }

  const { error } = await access.supabase
    .from("saved_listings")
    .insert({ user_id: access.user.id, listing_id: listingId });

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to save listing" },
      { status: 500 }
    );
  }

  return NextResponse.json({ saved: true }, { status: 200 });
}

export async function DELETE(request) {
  const access = await getCustomerSaveAccess();
  if (!access.ok) return access.response;

  const listingId = await readListingId(request);
  if (!listingId) {
    return NextResponse.json({ error: "Missing listing id" }, { status: 400 });
  }

  const { error } = await access.supabase
    .from("saved_listings")
    .delete()
    .eq("user_id", access.user.id)
    .eq("listing_id", listingId);

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to unsave listing" },
      { status: 500 }
    );
  }

  return NextResponse.json({ saved: false }, { status: 200 });
}
