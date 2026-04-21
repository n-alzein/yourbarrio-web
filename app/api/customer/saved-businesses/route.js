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
        { error: "Business accounts cannot save businesses." },
        { status: 403 }
      ),
    };
  }

  return { ok: true, supabase, user };
}

async function readBusinessId(request) {
  const body = await request.json().catch(() => ({}));
  return String(body?.businessId || "").trim();
}

export async function POST(request) {
  const access = await getCustomerSaveAccess();
  if (!access.ok) return access.response;

  const businessId = await readBusinessId(request);
  if (!businessId) {
    return NextResponse.json({ error: "Missing business id" }, { status: 400 });
  }

  const { error } = await access.supabase
    .from("saved_businesses")
    .upsert(
      { user_id: access.user.id, business_id: businessId },
      { onConflict: "user_id,business_id" }
    );

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to save business" },
      { status: 500 }
    );
  }

  return NextResponse.json({ saved: true }, { status: 200 });
}

export async function DELETE(request) {
  const access = await getCustomerSaveAccess();
  if (!access.ok) return access.response;

  const businessId = await readBusinessId(request);
  if (!businessId) {
    return NextResponse.json({ error: "Missing business id" }, { status: 400 });
  }

  const { error } = await access.supabase
    .from("saved_businesses")
    .delete()
    .eq("user_id", access.user.id)
    .eq("business_id", businessId);

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to unsave business" },
      { status: 500 }
    );
  }

  return NextResponse.json({ saved: false }, { status: 200 });
}
