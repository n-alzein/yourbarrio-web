import { NextResponse } from "next/server";
import { getSupabaseServerClient, getUserCached } from "@/lib/supabaseServer";

export async function POST(request) {
  const supabase = await getSupabaseServerClient();
  const diagEnabled = process.env.NODE_ENV !== "production";
  let payload = null;

  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const businessId = payload?.businessId;
  if (!businessId) {
    return NextResponse.json({ error: "Missing businessId" }, { status: 400 });
  }

  const { user } = await getUserCached(supabase);

  if (user?.id && user.id === businessId) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const { error } = await supabase
    .from("business_views")
    .insert({ business_id: businessId, viewer_id: user?.id ?? null });

  if (error) {
    if (diagEnabled) {
      console.warn("[business.views] insert_failed", {
        businessId,
        viewerId: user?.id || null,
        code: error.code || null,
        message: error.message || null,
      });
    }
    return NextResponse.json(
      { error: "Failed to record view" },
      { status: 500 }
    );
  }

  if (diagEnabled) {
    console.warn("[business.views] inserted", {
      businessId,
      viewerId: user?.id || null,
    });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
