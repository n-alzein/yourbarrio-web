import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabaseServer";
import { isBusinessOnboardingComplete } from "@/lib/business/onboardingCompletion";
import { normalizeStateCode } from "@/lib/location/normalizeStateCode";
import { resolveBusinessCoordinates } from "@/lib/location/businessGeocoding";
import { buildBusinessTaxonomyPayload } from "@/lib/taxonomy/compat";
import { fetchBusinessTypeBySlug } from "@/lib/taxonomy/db";
import {
  isIncompleteUSPhone,
  normalizeUSPhoneForStorage,
} from "@/lib/utils/formatUSPhone";

function normalizeWebsite(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

export async function POST(req) {
  try {
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

    const { error: roleError } = await supabase.rpc("set_my_role_business");
    if (process.env.NODE_ENV !== "production") {
      console.warn("[AUTH_REDIRECT_TRACE] onboarding_role_flip", {
        code: roleError?.code || null,
        message: roleError?.message || null,
      });
    }
    if (roleError) {
      return NextResponse.json(
        { error: roleError.message || "Failed to set business role for this account" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      name,
      category,
      business_type,
      description,
      address,
      address_2,
      city,
      state,
      postal_code,
      phone,
      website,
    } = body || {};

    const trimmedName = String(name || "").trim();
    const taxonomy = buildBusinessTaxonomyPayload({ business_type, category });
    const businessType = await fetchBusinessTypeBySlug(supabase, taxonomy.business_type);
    const trimmedBusinessType = String(taxonomy.business_type || "").trim();
    const trimmedCategory = String(taxonomy.category || "").trim();
    if (!trimmedName || !trimmedBusinessType) {
      return NextResponse.json(
        { error: "Business name and business type are required" },
        { status: 400 }
      );
    }

    const normalizedWebsite = normalizeWebsite(website);
    const normalizedState = normalizeStateCode(state) || "";
    if (isIncompleteUSPhone(phone)) {
      return NextResponse.json(
        { error: "Enter a complete 10-digit US phone number." },
        { status: 400 }
      );
    }
    const normalizedPhone = normalizeUSPhoneForStorage(phone);
    const { data: existingUser, error: userReadError } = await supabase
      .from("users")
      .select("public_id,is_internal,latitude,longitude")
      .eq("id", user.id)
      .maybeSingle();
    const { data: existingBusiness } = await supabase
      .from("businesses")
      .select("is_internal,latitude,longitude")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (userReadError) {
      console.warn("business onboarding users read failed", {
        code: userReadError.code || null,
        message: userReadError.message || null,
      });
    }

    const { coords: geo } = await resolveBusinessCoordinates({
      nextLocation: {
        address,
        address_2,
        city,
        state: normalizedState,
        postal_code,
      },
      previousLocation: existingBusiness || existingUser || null,
      logger: console,
    });

    const usersPayload = {
      id: user.id,
      role: "business",
      public_id: existingUser?.public_id || null,
      full_name: trimmedName,
      business_name: trimmedName,
      business_type: businessType?.slug || trimmedBusinessType,
      category: businessType?.name || trimmedCategory,
      description: description || "",
      website: normalizedWebsite || "",
      address: address || "",
      address_2: address_2 || "",
      city: city || "",
      state: normalizedState,
      postal_code: postal_code || "",
      latitude: geo?.lat ?? null,
      longitude: geo?.lng ?? null,
      is_internal: existingUser?.is_internal === true,
      updated_at: new Date().toISOString(),
    };

    const { error: userUpsertError } = await supabase.from("users").upsert(usersPayload, {
      onConflict: "id",
      ignoreDuplicates: false,
    });

    if (userUpsertError) {
      console.error("business onboarding users upsert failed", {
        code: userUpsertError.code || null,
        message: userUpsertError.message || null,
      });
      return NextResponse.json(
        { error: userUpsertError.message || "Failed to save business account" },
        { status: 400 }
      );
    }

    const businessesPayload = {
      owner_user_id: user.id,
      public_id: existingUser?.public_id || null,
      business_name: trimmedName,
      business_type_id: businessType?.id || null,
      business_type: businessType?.slug || trimmedBusinessType,
      category: businessType?.name || trimmedCategory,
      description: description || "",
      website: normalizedWebsite || "",
      phone: normalizedPhone || "",
      address: address || "",
      address_2: address_2 || "",
      city: city || "",
      state: normalizedState,
      postal_code: postal_code || "",
      latitude: geo?.lat ?? null,
      longitude: geo?.lng ?? null,
      is_internal: existingBusiness?.is_internal === true,
      verification_status: "pending",
      updated_at: new Date().toISOString(),
    };

    const { data: businessRow, error: businessUpsertError } = await supabase
      .from("businesses")
      .upsert(businessesPayload, {
        onConflict: "owner_user_id",
        ignoreDuplicates: false,
      })
      .select(
        "id,owner_user_id,public_id,business_name,business_type_id,business_type,category,address,city,state,postal_code,verification_status"
      )
      .single();

    if (businessUpsertError) {
      console.error("business onboarding businesses upsert failed", {
        code: businessUpsertError.code || null,
        message: businessUpsertError.message || null,
      });
      return NextResponse.json(
        { error: businessUpsertError.message || "Failed to save business profile" },
        { status: 400 }
      );
    }

    if (process.env.NODE_ENV !== "production") {
      console.warn("[AUTH_REDIRECT_TRACE] onboarding_upsert_result", {
        businessKeys: Object.keys(businessRow || {}),
      });
    }

    if (!isBusinessOnboardingComplete(businessRow)) {
      console.error("business onboarding saved row is incomplete", {
        owner_user_id: businessRow?.owner_user_id || null,
      });
      return NextResponse.json(
        { error: "Business profile is incomplete after save." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        id: businessRow?.id || null,
        owner_user_id: businessRow?.owner_user_id || null,
        public_id: businessRow?.public_id || null,
        row: businessRow || null,
        geo,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Business create API error", err);
    return NextResponse.json(
      { error: err?.message || "Unexpected server error" },
      { status: 500 }
    );
  }
}
