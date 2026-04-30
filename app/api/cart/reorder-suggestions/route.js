import { NextResponse } from "next/server";
import { getCartReorderSuggestions } from "@/lib/cart/getReorderSuggestions.server";
import { getSupabaseServerClient, getUserCached, getProfileCached } from "@/lib/supabaseServer";

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { user } = await getUserCached(supabase);

    if (!user?.id) {
      return NextResponse.json({ items: [] }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    const profile = await getProfileCached(user.id, supabase);
    const items = await getCartReorderSuggestions({
      supabase,
      userId: user.id,
      isCustomer: String(profile?.role || "").trim().toLowerCase() === "customer",
    });

    return NextResponse.json(
      { items },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    return NextResponse.json({ items: [] }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
