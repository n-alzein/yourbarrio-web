import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export async function GET(request) {
  const response = NextResponse.next();
  const supabase = createSupabaseRouteHandlerClient(request, response);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ user: null, profile: null }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json(
      { user, profile: null, error: profileError.message || "Failed to load profile" },
      { status: 500 }
    );
  }

  return NextResponse.json({ user, profile: profile || null }, { status: 200 });
}
