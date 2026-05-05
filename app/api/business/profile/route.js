import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabaseServer";
import { normalizeStateCode } from "@/lib/location/normalizeStateCode";
import { resolveBusinessCoordinates } from "@/lib/location/businessGeocoding";
import { buildBusinessTaxonomyPayload } from "@/lib/taxonomy/compat";
import { fetchBusinessTypeBySlug } from "@/lib/taxonomy/db";
import {
  isIncompleteUSPhone,
  normalizeUSPhoneForStorage,
} from "@/lib/utils/formatUSPhone";

function normalizeWebsite(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

function trimString(value, fallback = "") {
  if (value === null) return "";
  if (value === undefined) return fallback;
  return String(value).trim();
}

function pickString(body, key, fallback = "") {
  return trimString(body?.[key], fallback);
}

function hasOwn(body, key) {
  return Object.prototype.hasOwnProperty.call(body || {}, key);
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

  const [userResult, businessResult] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id,public_id,is_internal,full_name,business_name,business_type,category,description,website,phone,email,address,address_2,city,state,postal_code,profile_photo_url,cover_photo_url,latitude,longitude,hours_json,social_links_json"
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("businesses")
      .select(
        "owner_user_id,public_id,is_internal,business_name,business_type_id,business_type,category,description,website,phone,address,address_2,city,state,postal_code,profile_photo_url,cover_photo_url,latitude,longitude,hours_json,social_links_json,pickup_enabled_default,local_delivery_enabled_default,default_delivery_fee_cents,delivery_radius_miles,delivery_min_order_cents,delivery_notes"
      )
      .eq("owner_user_id", user.id)
      .maybeSingle(),
  ]);

  if (userResult.error) {
    return NextResponse.json(
      { error: userResult.error.message || "Failed to read profile" },
      { status: 400 }
    );
  }

  if (businessResult.error) {
    const code = String(businessResult.error.code || "");
    const isSchemaMissing = code === "42P01" || code === "42703" || code === "PGRST204";
    if (!isSchemaMissing) {
      return NextResponse.json(
        { error: businessResult.error.message || "Failed to read business profile" },
        { status: 400 }
      );
    }
  }

  const existingUser = userResult.data || {};
  const existingBusiness = businessResult.data || {};
  const taxonomy = buildBusinessTaxonomyPayload({
    business_type: pickString(body, "business_type", existingBusiness.business_type || existingUser.business_type || ""),
    category: pickString(body, "category", existingBusiness.category || existingUser.category || ""),
  });
  const businessType = await fetchBusinessTypeBySlug(supabase, taxonomy.business_type);

  const fullName = hasOwn(body, "full_name")
    ? pickString(body, "full_name")
    : pickString(body, "business_name", existingUser.full_name || existingUser.business_name || existingBusiness.business_name || "");
  const businessName = hasOwn(body, "business_name")
    ? pickString(body, "business_name")
    : fullName || existingBusiness.business_name || existingUser.business_name || "";
  const normalizedState = hasOwn(body, "state")
    ? normalizeStateCode(body.state) || ""
    : normalizeStateCode(existingBusiness.state || existingUser.state) || "";
  const normalizedWebsite = hasOwn(body, "website")
    ? normalizeWebsite(body.website)
    : normalizeWebsite(existingBusiness.website || existingUser.website || "");
  const phoneSource = hasOwn(body, "phone")
    ? pickString(body, "phone")
    : existingBusiness.phone || "";
  if (isIncompleteUSPhone(phoneSource)) {
    return NextResponse.json(
      { error: "Enter a complete 10-digit US phone number." },
      { status: 400 }
    );
  }
  const normalizedPhone = normalizeUSPhoneForStorage(phoneSource);

  const mergedLocation = {
    address: hasOwn(body, "address")
      ? pickString(body, "address")
      : existingBusiness.address || existingUser.address || "",
    address_2: hasOwn(body, "address_2")
      ? pickString(body, "address_2")
      : existingBusiness.address_2 || existingUser.address_2 || "",
    city: hasOwn(body, "city")
      ? pickString(body, "city")
      : existingBusiness.city || existingUser.city || "",
    state: normalizedState,
    postal_code: hasOwn(body, "postal_code")
      ? pickString(body, "postal_code")
      : existingBusiness.postal_code || existingUser.postal_code || "",
  };

  const { coords } = await resolveBusinessCoordinates({
    nextLocation: mergedLocation,
    previousLocation: existingBusiness || existingUser || null,
    logger: console,
  });

  const userPayload = {
    full_name: fullName,
    business_name: businessName,
    business_type: businessType?.slug || taxonomy.business_type,
    category: businessType?.name || taxonomy.category,
    description: hasOwn(body, "description")
      ? pickString(body, "description")
      : existingUser.description || existingBusiness.description || "",
    website: normalizedWebsite,
    email: hasOwn(body, "email") ? pickString(body, "email") : existingUser.email || "",
    address: mergedLocation.address,
    address_2: mergedLocation.address_2,
    city: mergedLocation.city,
    state: mergedLocation.state,
    postal_code: mergedLocation.postal_code,
    profile_photo_url: hasOwn(body, "profile_photo_url")
      ? pickString(body, "profile_photo_url")
      : existingUser.profile_photo_url || existingBusiness.profile_photo_url || "",
    cover_photo_url: hasOwn(body, "cover_photo_url")
      ? pickString(body, "cover_photo_url")
      : existingUser.cover_photo_url || existingBusiness.cover_photo_url || "",
    hours_json: hasOwn(body, "hours_json") ? body.hours_json : existingUser.hours_json ?? existingBusiness.hours_json ?? null,
    social_links_json: hasOwn(body, "social_links_json")
      ? body.social_links_json
      : existingUser.social_links_json ?? existingBusiness.social_links_json ?? null,
    latitude: coords?.lat ?? null,
    longitude: coords?.lng ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data: updatedUser, error: userUpdateError } = await supabase
    .from("users")
    .update(userPayload)
    .eq("id", user.id)
    .select("*")
    .maybeSingle();

  if (userUpdateError || !updatedUser) {
    return NextResponse.json(
      { error: userUpdateError?.message || "Failed to update profile" },
      { status: 400 }
    );
  }

  const businessPayload = {
    owner_user_id: user.id,
    public_id: existingBusiness.public_id || existingUser.public_id || null,
    business_name: businessName || null,
    business_type_id: businessType?.id || null,
    business_type: businessType?.slug || taxonomy.business_type || null,
    category: businessType?.name || taxonomy.category || null,
    description: userPayload.description || null,
    website: normalizedWebsite || null,
    phone: normalizedPhone || null,
    address: mergedLocation.address || null,
    address_2: mergedLocation.address_2 || null,
    city: mergedLocation.city || null,
    state: mergedLocation.state || null,
    postal_code: mergedLocation.postal_code || null,
    profile_photo_url: userPayload.profile_photo_url || null,
    cover_photo_url: userPayload.cover_photo_url || null,
    hours_json: userPayload.hours_json,
    social_links_json: userPayload.social_links_json,
    latitude: coords?.lat ?? null,
    longitude: coords?.lng ?? null,
    pickup_enabled_default: hasOwn(body, "pickup_enabled_default")
      ? body.pickup_enabled_default !== false
      : existingBusiness.pickup_enabled_default,
    local_delivery_enabled_default: hasOwn(body, "local_delivery_enabled_default")
      ? body.local_delivery_enabled_default === true
      : existingBusiness.local_delivery_enabled_default,
    default_delivery_fee_cents: hasOwn(body, "default_delivery_fee_cents")
      ? body.default_delivery_fee_cents
      : existingBusiness.default_delivery_fee_cents ?? null,
    delivery_radius_miles: hasOwn(body, "delivery_radius_miles")
      ? body.delivery_radius_miles
      : existingBusiness.delivery_radius_miles ?? null,
    delivery_min_order_cents: hasOwn(body, "delivery_min_order_cents")
      ? body.delivery_min_order_cents
      : existingBusiness.delivery_min_order_cents ?? null,
    delivery_notes: hasOwn(body, "delivery_notes")
      ? trimString(body.delivery_notes)
      : existingBusiness.delivery_notes ?? null,
    is_internal: existingBusiness.is_internal === true || existingUser.is_internal === true,
    updated_at: new Date().toISOString(),
  };

  const { data: updatedBusiness, error: businessUpsertError } = await supabase
    .from("businesses")
    .upsert(businessPayload, { onConflict: "owner_user_id", ignoreDuplicates: false })
    .select("*")
    .maybeSingle();

  if (businessUpsertError) {
    return NextResponse.json(
      { error: businessUpsertError.message || "Failed to sync business profile" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    profile: {
      ...updatedUser,
      ...updatedBusiness,
      id: user.id,
      owner_user_id: user.id,
    },
    coordinates: coords,
  });
}
