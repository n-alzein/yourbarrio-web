import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabaseServer";
import { normalizeStateCode } from "@/lib/location/normalizeStateCode";
import {
  isIncompleteUSPhone,
  normalizeUSPhoneForStorage,
} from "@/lib/utils/formatUSPhone";

function hasOwn(body, key) {
  return Object.prototype.hasOwnProperty.call(body || {}, key);
}

function trimString(value) {
  return String(value ?? "").trim();
}

export async function POST(req) {
  const response = NextResponse.next();
  const supabase = createSupabaseRouteHandlerClient(req, response);
  if (!supabase) {
    return NextResponse.json(
      { error: "Server is missing Supabase credentials" },
      { status: 500 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const updates = {
    updated_at: new Date().toISOString(),
  };

  if (hasOwn(body, "full_name")) updates.full_name = trimString(body.full_name);
  if (hasOwn(body, "profile_photo_url")) {
    updates.profile_photo_url = trimString(body.profile_photo_url);
  }
  if (hasOwn(body, "phone")) {
    const phone = trimString(body.phone);
    if (isIncompleteUSPhone(phone)) {
      return NextResponse.json(
        { error: "Enter a complete 10-digit US phone number." },
        { status: 400 }
      );
    }
    updates.phone = normalizeUSPhoneForStorage(phone) || null;
  }
  if (hasOwn(body, "city")) updates.city = trimString(body.city) || null;
  if (hasOwn(body, "address")) updates.address = trimString(body.address) || null;
  if (hasOwn(body, "address_2")) updates.address_2 = trimString(body.address_2) || null;
  if (hasOwn(body, "state")) {
    updates.state = normalizeStateCode(body.state) || null;
  }
  if (hasOwn(body, "postal_code")) {
    updates.postal_code = trimString(body.postal_code) || null;
  }

  const { data: profile, error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", user.id)
    .select("*")
    .maybeSingle();

  if (error || !profile) {
    return NextResponse.json(
      { error: error?.message || "Failed to update account profile" },
      { status: 400 }
    );
  }

  return NextResponse.json({ profile });
}
