import "server-only";

import { getEffectiveActorAndTarget } from "@/lib/admin/supportMode";
import { getBusinessByUserId } from "@/lib/business/getBusinessByUserId";
import {
  getRequiredBusinessId,
  resolveRoleFromUserAndClient,
} from "@/lib/business/requireBusinessRow";
import { ensureBusinessProvisionedForUser } from "@/lib/auth/ensureBusinessProvisioning";
import { getSupabaseServerClient as getServiceRoleClient } from "@/lib/supabase/server";
import { getSupabaseServerClient, getUserCached } from "@/lib/supabaseServer";

function normalizeRole(value) {
  if (typeof value !== "string") return null;
  const role = value.trim().toLowerCase();
  if (role === "business" || role === "customer" || role === "admin") return role;
  return null;
}

function isMissingRelationError(error) {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST204" ||
    message.includes("vendor_members") && message.includes("does not exist")
  );
}

async function ensureOwnerVendorMembership({ client, userId }) {
  if (!client || !userId) return;

  const { error } = await client.from("vendor_members").insert({
    vendor_id: userId,
    user_id: userId,
    role: "owner",
  });

  if (!error || error.code === "23505") return;
  if (isMissingRelationError(error)) return;

  if (process.env.NODE_ENV !== "production") {
    console.warn("[business-access] vendor_members_self_heal_failed", {
      userId,
      code: error.code || null,
      message: error.message || null,
    });
  }
}

export async function getBusinessDataClientForRequest() {
  const supabase = await getSupabaseServerClient();
  const { user, error: userError } = await getUserCached(supabase);

  if (userError || !user?.id) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
    };
  }

  const resolved = await getEffectiveActorAndTarget(user.id);

  if (resolved.supportMode) {
    if (resolved.targetRole !== "business") {
      return {
        ok: false,
        status: 403,
        error: "Support mode target is not a business",
      };
    }

    const serviceClient = getServiceRoleClient();
    if (!serviceClient) {
      return {
        ok: false,
        status: 500,
        error: "Missing server data client",
      };
    }

    const { data: targetProfile, error: profileError } = await serviceClient
      .from("users")
      .select("id, role, business_name, full_name, profile_photo_url, public_id, is_internal")
      .eq("id", resolved.effectiveUserId)
      .maybeSingle();

    if (profileError || !targetProfile) {
      return {
        ok: false,
        status: 404,
        error: "Business profile not found",
      };
    }

    const effectiveBusiness = await getBusinessByUserId({
      client: serviceClient,
      userId: resolved.effectiveUserId,
    });
    let businessId = null;
    try {
      businessId = await getRequiredBusinessId({
        supabase: serviceClient,
        userId: resolved.effectiveUserId,
        role: "business",
      });
    } catch (error) {
      return {
        ok: false,
        status: error?.status || 403,
        error: error?.message || "Business onboarding required",
      };
    }

    await ensureOwnerVendorMembership({
      client: serviceClient,
      userId: resolved.effectiveUserId,
    });

    return {
      ok: true,
      client: serviceClient,
      actorUserId: user.id,
      effectiveUserId: resolved.effectiveUserId,
      businessId,
      supportMode: true,
      effectiveProfile: effectiveBusiness || targetProfile,
    };
  }

  const readProfile = async () =>
    supabase
      .from("users")
      .select("id, role, business_name, full_name, profile_photo_url, public_id, is_internal")
      .eq("id", user.id)
      .maybeSingle();

  let { data: profile, error: profileError } = await readProfile();

  if (profileError || !profile) {
    const authRole = normalizeRole(user?.app_metadata?.role || user?.user_metadata?.role);
    if (authRole === "business") {
      try {
        await ensureBusinessProvisionedForUser({
          userId: user.id,
          email: user.email || "",
          source: "business_data_loader",
        });
        const retry = await readProfile();
        profile = retry.data || null;
        profileError = retry.error || null;
      } catch (provisionError) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[AUTH_REDIRECT_TRACE] business_provisioning:loader_failed", {
            userId: user.id,
            message: provisionError?.message || String(provisionError),
          });
        }
      }
    }
  }

  if (profileError || !profile) {
    return {
      ok: false,
      status: 403,
      error: "Business onboarding required",
    };
  }

  const role = (await resolveRoleFromUserAndClient(supabase, user)) || profile.role;

  if (role !== "business") {
    return {
      ok: false,
      status: 403,
      error: "Forbidden",
    };
  }

  let businessId = null;
  try {
    businessId = await getRequiredBusinessId({
      supabase,
      userId: user.id,
      role,
    });
  } catch (error) {
    return {
      ok: false,
      status: error?.status || 403,
      error: error?.message || "Business onboarding required",
    };
  }

  await ensureOwnerVendorMembership({
    client: supabase,
    userId: user.id,
  });

  const effectiveBusiness = await getBusinessByUserId({
    client: supabase,
    userId: user.id,
    selfHeal: false,
  });

  return {
    ok: true,
    client: supabase,
    actorUserId: user.id,
    effectiveUserId: user.id,
    businessId,
    supportMode: false,
    effectiveProfile: effectiveBusiness || profile,
  };
}
