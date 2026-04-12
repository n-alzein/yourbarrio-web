import "server-only";

import { getEffectiveActorAndTarget } from "@/lib/admin/supportMode";
import { isBlockedAccountStatus, normalizeAccountStatus } from "@/lib/accountDeletion/status";
import { getBusinessByUserId } from "@/lib/business/getBusinessByUserId";
import {
  getRequiredBusinessId,
} from "@/lib/business/requireBusinessRow";
import { ensureBusinessProvisionedForUser } from "@/lib/auth/ensureBusinessProvisioning";
import { getSupabaseServerClient as getServiceRoleClient } from "@/lib/supabase/server";
import { getSupabaseServerClient, getUserCached } from "@/lib/supabaseServer";
import { createServerTiming, logServerTiming, perfTimingEnabled } from "@/lib/serverTiming";

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

export async function getBusinessDataClientForRequest(options = {}) {
  const {
    includeEffectiveProfile = true,
    ensureVendorMembership: shouldEnsureVendorMembership = true,
    timingLabel = "business-data-access",
  } = options;
  const timing = createServerTiming("biz_access_");
  const tTotal = timing.start();
  const t0 = timing.start();
  const supabase = await getSupabaseServerClient();
  const clientMs = timing.end("client", t0);
  const t1 = timing.start();
  const { user, error: userError } = await getUserCached(supabase);
  const sessionMs = timing.end("session", t1);

  if (userError || !user?.id) {
    await maybeLogBusinessAccessTiming(timingLabel, timing, {
      clientMs,
      sessionMs,
      outcome: "unauthorized",
      totalMs: Math.round(timing.end("total", tTotal)),
    });
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
    };
  }

  const t2 = timing.start();
  const resolved = await getEffectiveActorAndTarget(user.id);
  const actorMs = timing.end("effective_actor", t2);

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

    const t3 = timing.start();
    const targetProfileQuery = serviceClient
      .from("users")
      .select("id, role, business_name, full_name, profile_photo_url, public_id, is_internal, account_status")
      .eq("id", resolved.effectiveUserId)
      .maybeSingle();
    const businessIdQuery = getRequiredBusinessId({
      supabase: serviceClient,
      userId: resolved.effectiveUserId,
      role: "business",
    }).then(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error })
    );
    const effectiveProfileQuery = includeEffectiveProfile
      ? getBusinessByUserId({
          client: serviceClient,
          userId: resolved.effectiveUserId,
        })
      : Promise.resolve(null);
    const [{ data: targetProfile, error: profileError }, businessIdResult, effectiveBusiness] =
      await Promise.all([targetProfileQuery, businessIdQuery, effectiveProfileQuery]);
    const supportLookupMs = timing.end("support_lookup", t3);

    if (profileError || !targetProfile) {
      await maybeLogBusinessAccessTiming(timingLabel, timing, {
        clientMs,
        sessionMs,
        actorMs,
        supportLookupMs,
        outcome: "support_profile_missing",
        totalMs: Math.round(timing.end("total", tTotal)),
      });
      return {
        ok: false,
        status: 404,
        error: "Business profile not found",
      };
    }

    const supportAccountStatus = normalizeAccountStatus(targetProfile.account_status);
    if (isBlockedAccountStatus(supportAccountStatus)) {
      return {
        ok: false,
        status: 403,
        error: "Account unavailable",
      };
    }

    if (!businessIdResult?.ok) {
      await maybeLogBusinessAccessTiming(timingLabel, timing, {
        clientMs,
        sessionMs,
        actorMs,
        supportLookupMs,
        outcome: "support_business_required",
        totalMs: Math.round(timing.end("total", tTotal)),
      });
      return {
        ok: false,
        status: businessIdResult?.error?.status || 403,
        error: businessIdResult?.error?.message || "Business onboarding required",
      };
    }
    const businessId = businessIdResult.value;

    let vendorMembershipMs = 0;
    if (shouldEnsureVendorMembership) {
      const t4 = timing.start();
      await ensureOwnerVendorMembership({
        client: serviceClient,
        userId: resolved.effectiveUserId,
      });
      vendorMembershipMs = timing.end("vendor_membership", t4);
    }

    await maybeLogBusinessAccessTiming(timingLabel, timing, {
      clientMs,
      sessionMs,
      actorMs,
      supportLookupMs,
      vendorMembershipMs,
      includeEffectiveProfile,
      ensureVendorMembership: shouldEnsureVendorMembership,
      supportMode: true,
      totalMs: Math.round(timing.end("total", tTotal)),
    });

    return {
      ok: true,
      client: serviceClient,
      actorUserId: user.id,
      effectiveUserId: resolved.effectiveUserId,
      businessId,
      supportMode: true,
      effectiveProfile: includeEffectiveProfile
        ? effectiveBusiness || targetProfile
        : targetProfile,
    };
  }

  const readProfile = async () =>
    supabase
    .from("users")
      .select("id, role, business_name, full_name, profile_photo_url, public_id, is_internal, account_status")
      .eq("id", user.id)
      .maybeSingle();

  const t3 = timing.start();
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

  const profileMs = timing.end("profile", t3);
  const accountStatus = normalizeAccountStatus(profile?.account_status);
  if (isBlockedAccountStatus(accountStatus)) {
    await maybeLogBusinessAccessTiming(timingLabel, timing, {
      clientMs,
      sessionMs,
      actorMs,
      profileMs,
      outcome: "blocked_account",
      totalMs: Math.round(timing.end("total", tTotal)),
    });
    return {
      ok: false,
      status: 403,
      error: "Account unavailable",
    };
  }

  if (profileError || !profile) {
    await maybeLogBusinessAccessTiming(timingLabel, timing, {
      clientMs,
      sessionMs,
      actorMs,
      profileMs,
      outcome: "profile_missing",
      totalMs: Math.round(timing.end("total", tTotal)),
    });
    return {
      ok: false,
      status: 403,
      error: "Business onboarding required",
    };
  }

  const role = normalizeRole(user?.app_metadata?.role || user?.user_metadata?.role) || profile.role;

  if (role !== "business") {
    await maybeLogBusinessAccessTiming(timingLabel, timing, {
      clientMs,
      sessionMs,
      actorMs,
      profileMs,
      outcome: "forbidden",
      totalMs: Math.round(timing.end("total", tTotal)),
    });
    return {
      ok: false,
      status: 403,
      error: "Forbidden",
    };
  }

  const t4 = timing.start();
  let businessId = null;
  try {
    businessId = await getRequiredBusinessId({
      supabase,
      userId: user.id,
      role,
    });
  } catch (error) {
    const businessIdMs = timing.end("business_id", t4);
    await maybeLogBusinessAccessTiming(timingLabel, timing, {
      clientMs,
      sessionMs,
      actorMs,
      profileMs,
      businessIdMs,
      outcome: "business_required",
      totalMs: Math.round(timing.end("total", tTotal)),
    });
    return {
      ok: false,
      status: error?.status || 403,
      error: error?.message || "Business onboarding required",
    };
  }

  const businessIdMs = timing.end("business_id", t4);
  let vendorMembershipMs = 0;
  if (shouldEnsureVendorMembership) {
    const t5 = timing.start();
    await ensureOwnerVendorMembership({
      client: supabase,
      userId: user.id,
    });
    vendorMembershipMs = timing.end("vendor_membership", t5);
  }

  let effectiveBusiness = null;
  let effectiveProfileMs = 0;
  if (includeEffectiveProfile) {
    const t6 = timing.start();
    effectiveBusiness = await getBusinessByUserId({
      client: supabase,
      userId: user.id,
      selfHeal: false,
    });
    effectiveProfileMs = timing.end("effective_profile", t6);
  }

  await maybeLogBusinessAccessTiming(timingLabel, timing, {
    clientMs,
    sessionMs,
    actorMs,
    profileMs,
    businessIdMs,
    vendorMembershipMs,
    effectiveProfileMs,
    includeEffectiveProfile,
    ensureVendorMembership: shouldEnsureVendorMembership,
    supportMode: false,
    totalMs: Math.round(timing.end("total", tTotal)),
  });

  return {
    ok: true,
    client: supabase,
    actorUserId: user.id,
    effectiveUserId: user.id,
    businessId,
    supportMode: false,
    effectiveProfile: includeEffectiveProfile ? effectiveBusiness || profile : profile,
  };
}

async function maybeLogBusinessAccessTiming(label, timing, payload) {
  if (!(await perfTimingEnabled())) return;
  await logServerTiming(label, {
    ...payload,
    timing: timing.header(),
  });
}
