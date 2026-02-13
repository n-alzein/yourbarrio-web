import { NextResponse } from "next/server";
import { getSupabaseRefFromUrl } from "@/lib/supabase/ref";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const publicRef = getSupabaseRefFromUrl(String(process.env.NEXT_PUBLIC_SUPABASE_URL || ""));
  const serverRef = getSupabaseRefFromUrl(
    String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
  );

  return NextResponse.json({
    public_ref: publicRef,
    server_ref: serverRef,
    match: publicRef === serverRef,
  });
}
