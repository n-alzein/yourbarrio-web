"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import {
  clearSupportModeCookies,
  getEffectiveActorAndTarget,
  readSupportModeCookies,
  validateSupportModeSession,
  IMPERSONATE_SESSION_COOKIE,
  IMPERSONATE_TARGET_ROLE_COOKIE,
  IMPERSONATE_USER_COOKIE,
} from "@/lib/admin/supportMode";
import { clearAllAuthCookies } from "@/lib/auth/clearAuthCookies";
import { getSafeRedirectPath } from "@/lib/auth/redirects";
import {
  ADMIN_ROLES,
  canAdmin,
  requireAdmin,
  requireAdminAnyRole,
  requireAdminRole,
  type AdminCapability,
  type AdminRole,
} from "@/lib/admin/permissions";
import { shouldUseSecureCookies } from "@/lib/http/cookiesSecurity";
import { getSupabaseServerAuthedClient, getSupabaseServerClient } from "@/lib/supabaseServer";
import { getAdminDataClient, getAdminServiceRoleClient } from "@/lib/supabase/admin";

function withMessage(pathname: string, type: "success" | "error" | "ok" | "err", message: string) {
  const normalizedPath = getSafeRedirectPath(pathname || "") || "/admin";
  const [rawPath, hash = ""] = normalizedPath.split("#");
  const url = new URL(rawPath || "/admin", "http://local");
  url.searchParams.set(type, message);
  if (type === "ok") url.searchParams.set("success", message);
  if (type === "err") url.searchParams.set("error", message);
  const query = url.searchParams.toString();
  const suffix = hash ? `#${hash}` : "";
  return `${url.pathname}${query ? `?${query}` : ""}${suffix}`;
}

async function resolveAdminUserPath(client: any, userId: string) {
  const { data } = await client
    .from("users")
    .select("public_id")
    .eq("id", userId)
    .maybeSingle();
  const ref = String(data?.public_id || userId).trim();
  return `/admin/users/${encodeURIComponent(ref || userId)}`;
}

const SAFE_APP_ROLES = ["customer", "business", "user"] as const;
const SUPER_ONLY_APP_ROLES = ["admin"] as const;

function requireCapabilityOrRedirect(
  admin: Awaited<ReturnType<typeof requireAdmin>>,
  capability: AdminCapability,
  redirectPath: string
) {
  if (!admin.strictPermissionBypassUsed && !canAdmin(admin.roles, capability)) {
    redirect(withMessage(redirectPath, "error", "Unauthorized"));
  }
}

const updateUserRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.string().min(2).max(64),
});

export async function updateUserRoleAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = updateUserRoleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    redirect(withMessage("/admin/accounts", "error", "Invalid role update payload"));
  }

  const fallbackTargetPath = `/admin/users/${parsed.data.userId}`;
  requireCapabilityOrRedirect(admin, "update_app_role", fallbackTargetPath);

  const nextRole = String(parsed.data.role || "").trim().toLowerCase();
  const safeRoles = new Set<string>(SAFE_APP_ROLES);
  const superOnlyRoles = new Set<string>(SUPER_ONLY_APP_ROLES);
  const canManageAdmins = admin.strictPermissionBypassUsed || canAdmin(admin.roles, "manage_admins");
  if (!safeRoles.has(nextRole) && !(canManageAdmins && superOnlyRoles.has(nextRole))) {
    redirect(withMessage(fallbackTargetPath, "error", "Unauthorized role update"));
  }

  const { client } = await getAdminDataClient({ mode: "service" });
  const targetPath = await resolveAdminUserPath(client, parsed.data.userId);
  const { data: existingUser } = await client
    .from("users")
    .select("role")
    .eq("id", parsed.data.userId)
    .maybeSingle();
  const { error } = await client
    .from("users")
    .update({ role: nextRole, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.userId);

  if (error) {
    redirect(withMessage(targetPath, "error", error.message));
  }

  await audit({
    action: "user_role_updated",
    targetType: "user",
    targetId: parsed.data.userId,
    actorUserId: admin.user.id,
    meta: { previous_role: existingUser?.role || null, new_role: nextRole },
  });

  revalidatePath(targetPath);
  redirect(withMessage(targetPath, "success", "Role updated"));
}

const toggleInternalSchema = z.object({
  userId: z.string().uuid(),
  isInternal: z.enum(["true", "false"]),
});

export async function toggleUserInternalAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = toggleInternalSchema.safeParse({
    userId: formData.get("userId"),
    isInternal: formData.get("isInternal"),
  });

  if (!parsed.success) {
    redirect(withMessage("/admin/accounts", "error", "Invalid internal toggle payload"));
  }

  const fallbackTargetPath = `/admin/users/${parsed.data.userId}`;
  requireCapabilityOrRedirect(admin, "toggle_internal_user", fallbackTargetPath);

  const nextValue = parsed.data.isInternal === "true";
  const { client } = await getAdminDataClient({ mode: "service" });
  const targetPath = await resolveAdminUserPath(client, parsed.data.userId);
  const { data: existingUser } = await client
    .from("users")
    .select("is_internal")
    .eq("id", parsed.data.userId)
    .maybeSingle();
  const { error } = await client
    .from("users")
    .update({ is_internal: nextValue, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.userId);

  if (error) {
    redirect(withMessage(targetPath, "error", error.message));
  }

  await audit({
    action: "user_internal_toggled",
    targetType: "user",
    targetId: parsed.data.userId,
    actorUserId: admin.user.id,
    meta: {
      previous_is_internal: existingUser?.is_internal ?? null,
      is_internal: nextValue,
    },
  });

  revalidatePath(targetPath);
  redirect(withMessage(targetPath, "success", "Internal flag updated"));
}

const internalNoteSchema = z.object({
  userId: z.string().uuid(),
  note: z.string().min(3).max(2000),
});

export async function addUserInternalNoteAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = internalNoteSchema.safeParse({
    userId: formData.get("userId"),
    note: formData.get("note"),
  });

  if (!parsed.success) {
    redirect(withMessage("/admin/accounts", "error", "Invalid note payload"));
  }

  const fallbackTargetPath = `/admin/users/${parsed.data.userId}`;
  requireCapabilityOrRedirect(admin, "add_internal_note", fallbackTargetPath);

  const { client } = await getAdminDataClient({ mode: "service" });
  const targetPath = await resolveAdminUserPath(client, parsed.data.userId);

  await audit({
    action: "user_internal_note_added",
    targetType: "user",
    targetId: parsed.data.userId,
    actorUserId: admin.user.id,
    meta: { note: parsed.data.note },
  });

  revalidatePath(targetPath);
  redirect(withMessage(targetPath, "success", "Note logged in audit trail"));
}

const updateUserProfileFieldsSchema = z.object({
  userId: z.string().uuid(),
  full_name: z.string().max(160).optional(),
  phone: z.string().max(64).optional(),
  business_name: z.string().max(160).optional(),
  category: z.string().max(120).optional(),
  website: z.string().max(500).optional(),
  address: z.string().max(240).optional(),
  address2: z.string().max(240).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  postal_code: z.string().max(32).optional(),
});

function normalizeNullableText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export async function updateUserProfileFieldsAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = updateUserProfileFieldsSchema.safeParse({
    userId: formData.get("userId"),
    full_name: formData.get("full_name") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    business_name: formData.get("business_name") ?? undefined,
    category: formData.get("category") ?? undefined,
    website: formData.get("website") ?? undefined,
    address: formData.get("address") ?? undefined,
    address2: formData.get("address2") ?? undefined,
    city: formData.get("city") ?? undefined,
    state: formData.get("state") ?? undefined,
    postal_code: formData.get("postal_code") ?? undefined,
  });

  if (!parsed.success) {
    redirect(withMessage("/admin/accounts", "error", "Invalid profile update payload"));
  }

  const fallbackTargetPath = `/admin/users/${parsed.data.userId}`;
  requireCapabilityOrRedirect(admin, "update_app_role", fallbackTargetPath);

  const { client } = await getAdminDataClient({ mode: "service" });
  const targetPath = await resolveAdminUserPath(client, parsed.data.userId);
  const updates = {
    full_name: normalizeNullableText(formData.get("full_name")),
    phone: normalizeNullableText(formData.get("phone")),
    business_name: normalizeNullableText(formData.get("business_name")),
    category: normalizeNullableText(formData.get("category")),
    website: normalizeNullableText(formData.get("website")),
    address: normalizeNullableText(formData.get("address")),
    address_2: normalizeNullableText(formData.get("address2")),
    city: normalizeNullableText(formData.get("city")),
    state: normalizeNullableText(formData.get("state")),
    postal_code: normalizeNullableText(formData.get("postal_code")),
    updated_at: new Date().toISOString(),
  };

  const { error } = await client
    .from("users")
    .update(updates)
    .eq("id", parsed.data.userId);

  if (error) {
    redirect(withMessage(targetPath, "error", error.message));
  }

  await audit({
    action: "user_profile_fields_updated",
    targetType: "user",
    targetId: parsed.data.userId,
    actorUserId: admin.user.id,
    meta: {
      updated_fields: Object.keys(updates).filter((key) => key !== "updated_at"),
    },
  });

  revalidatePath(targetPath);
  redirect(withMessage(targetPath, "success", "Profile updated"));
}

const moderationUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "in_review", "resolved", "dismissed"]),
  adminNotes: z.string().max(2000).optional(),
  returnTo: z.string().optional(),
});

const moderationTakeSchema = z.object({
  id: z.string().uuid(),
  returnTo: z.string().optional(),
});

const moderationHideSchema = z.object({
  id: z.string().uuid(),
  targetId: z.string().uuid(),
  adminNotes: z.string().max(2000).optional(),
  returnTo: z.string().optional(),
});

function resolveModerationReturnTo(value?: string) {
  return getSafeRedirectPath(value || "") || "/admin/moderation";
}

function isNextRedirectError(error: unknown) {
  return typeof (error as { digest?: unknown })?.digest === "string" &&
    String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT");
}

function toErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || "Unknown error");
  }
  return "Unknown error";
}

function revalidateModerationReturnTo(returnTo: string) {
  const pathOnly = (returnTo || "/admin/moderation").split("?")[0] || "/admin/moderation";
  revalidatePath("/admin/moderation");
  if (pathOnly !== "/admin/moderation") {
    revalidatePath(pathOnly);
  }
}

export async function takeModerationCaseAction(formData: FormData) {
  await requireAdminAnyRole(["admin_ops", "admin_super"]);
  const parsed = moderationTakeSchema.safeParse({
    id: formData.get("id"),
    returnTo: (formData.get("returnTo") || "").toString() || undefined,
  });

  const returnTo = resolveModerationReturnTo(parsed.success ? parsed.data.returnTo : undefined);
  if (!parsed.success) {
    redirect(withMessage(returnTo, "err", "Invalid moderation payload"));
  }
  const actionName = "takeModerationCaseAction";
  try {
    const { client } = await getAdminDataClient({ mode: "actor" });
    const { error } = await client.rpc("admin_take_moderation_case", {
      p_flag_id: parsed.data.id,
    });

    if (error) {
      const fallback = await client.rpc("admin_update_moderation_flag", {
        p_flag_id: parsed.data.id,
        p_status: "in_review",
        p_admin_notes: null,
        p_meta: { action: "take_case" },
      });
      if (fallback.error) {
        throw fallback.error;
      }
    }

    revalidateModerationReturnTo(returnTo);
    redirect(withMessage(returnTo, "ok", "case_taken"));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[admin][moderation] action failed", {
      action: actionName,
      error,
      inputs: {
        id: parsed.data.id,
        returnTo,
      },
    });
    redirect(withMessage(returnTo, "err", toErrorMessage(error)));
  }
}

export async function updateModerationFlagAction(formData: FormData) {
  await requireAdminAnyRole(["admin_ops", "admin_super"]);
  const parsed = moderationUpdateSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    adminNotes: (formData.get("adminNotes") || "").toString() || undefined,
    returnTo: (formData.get("returnTo") || "").toString() || undefined,
  });

  const returnTo = resolveModerationReturnTo(parsed.success ? parsed.data.returnTo : undefined);
  if (!parsed.success) {
    redirect(withMessage(returnTo, "err", "Invalid moderation update payload"));
  }
  const actionName = "updateModerationFlagAction";
  try {
    const { client } = await getAdminDataClient({ mode: "actor" });
    const { error } = await client.rpc("admin_update_moderation_flag", {
      p_flag_id: parsed.data.id,
      p_status: parsed.data.status,
      p_admin_notes: parsed.data.adminNotes || null,
      p_meta: { action: "status_change" },
    });

    if (error) {
      throw error;
    }

    revalidateModerationReturnTo(returnTo);
    redirect(withMessage(returnTo, "ok", "updated"));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[admin][moderation] action failed", {
      action: actionName,
      error,
      inputs: {
        id: parsed.data.id,
        status: parsed.data.status,
        hasAdminNotes: Boolean(parsed.data.adminNotes),
        returnTo,
      },
    });
    redirect(withMessage(returnTo, "err", toErrorMessage(error)));
  }
}

export async function hideListingAndResolveModerationFlagAction(formData: FormData) {
  await requireAdminAnyRole(["admin_ops", "admin_super"]);
  const parsed = moderationHideSchema.safeParse({
    id: formData.get("id"),
    targetId: formData.get("targetId"),
    adminNotes: (formData.get("adminNotes") || "").toString() || undefined,
    returnTo: (formData.get("returnTo") || "").toString() || undefined,
  });

  const returnTo = resolveModerationReturnTo(parsed.success ? parsed.data.returnTo : undefined);
  if (!parsed.success) {
    redirect(withMessage(returnTo, "err", "Invalid hide listing payload"));
  }
  const actionName = "hideListingAndResolveModerationFlagAction";
  try {
    const { client } = await getAdminDataClient({ mode: "actor" });
    const { error } = await client.rpc("admin_hide_listing_and_resolve_flag", {
      p_flag_id: parsed.data.id,
      p_listing_id: parsed.data.targetId,
      p_notes: parsed.data.adminNotes || null,
    });

    if (error) {
      throw error;
    }

    revalidateModerationReturnTo(returnTo);
    redirect(withMessage(returnTo, "ok", "hidden_and_resolved"));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[admin][moderation] action failed", {
      action: actionName,
      error,
      inputs: {
        id: parsed.data.id,
        targetId: parsed.data.targetId,
        hasAdminNotes: Boolean(parsed.data.adminNotes),
        returnTo,
      },
    });
    redirect(withMessage(returnTo, "err", toErrorMessage(error)));
  }
}

export async function hideReviewAndResolveModerationFlagAction(formData: FormData) {
  await requireAdminAnyRole(["admin_ops", "admin_super"]);
  const parsed = moderationHideSchema.safeParse({
    id: formData.get("id"),
    targetId: formData.get("targetId"),
    adminNotes: (formData.get("adminNotes") || "").toString() || undefined,
    returnTo: (formData.get("returnTo") || "").toString() || undefined,
  });

  const returnTo = resolveModerationReturnTo(parsed.success ? parsed.data.returnTo : undefined);
  if (!parsed.success) {
    redirect(withMessage(returnTo, "err", "Invalid hide review payload"));
  }
  const actionName = "hideReviewAndResolveModerationFlagAction";
  try {
    const { client } = await getAdminDataClient({ mode: "actor" });
    const { error } = await client.rpc("admin_hide_review_and_resolve_flag", {
      p_flag_id: parsed.data.id,
      p_review_id: parsed.data.targetId,
      p_notes: parsed.data.adminNotes || null,
    });

    if (error) {
      throw error;
    }

    revalidateModerationReturnTo(returnTo);
    redirect(withMessage(returnTo, "ok", "hidden_and_resolved"));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[admin][moderation] action failed", {
      action: actionName,
      error,
      inputs: {
        id: parsed.data.id,
        targetId: parsed.data.targetId,
        hasAdminNotes: Boolean(parsed.data.adminNotes),
        returnTo,
      },
    });
    redirect(withMessage(returnTo, "err", toErrorMessage(error)));
  }
}

const supportCreateSchema = z.object({
  requesterUserId: z.string().uuid().optional(),
  subject: z.string().min(3).max(300),
  body: z.string().max(3000).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});

export async function createSupportTicketAction(formData: FormData) {
  const admin = await requireAdminRole("admin_support");
  const parsed = supportCreateSchema.safeParse({
    requesterUserId: (formData.get("requesterUserId") || "").toString() || undefined,
    subject: formData.get("subject"),
    body: (formData.get("body") || "").toString() || undefined,
    priority: formData.get("priority") || "normal",
  });

  if (!parsed.success) {
    redirect(withMessage("/admin/support", "error", "Invalid support ticket payload"));
  }

  const { client } = await getAdminDataClient();
  const payload = {
    requester_user_id: parsed.data.requesterUserId || null,
    subject: parsed.data.subject,
    body: parsed.data.body || null,
    priority: parsed.data.priority,
    status: "open",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client.from("support_tickets").insert(payload).select("id").single();

  if (error) {
    redirect(withMessage("/admin/support", "error", error.message));
  }

  await audit({
    action: "support_ticket_created",
    targetType: "support_ticket",
    targetId: data.id,
    actorUserId: admin.user.id,
    meta: payload,
  });

  revalidatePath("/admin/support");
  redirect(withMessage("/admin/support", "success", "Support ticket created"));
}

const supportUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "pending", "resolved", "closed"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  assignedAdminUserId: z.string().uuid().optional(),
  adminNotes: z.string().max(2000).optional(),
});

export async function updateSupportTicketAction(formData: FormData) {
  const admin = await requireAdminRole("admin_support");
  const parsed = supportUpdateSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    priority: formData.get("priority"),
    assignedAdminUserId: (formData.get("assignedAdminUserId") || "").toString() || undefined,
    adminNotes: (formData.get("adminNotes") || "").toString() || undefined,
  });

  if (!parsed.success) {
    redirect(withMessage("/admin/support", "error", "Invalid support update payload"));
  }

  const { client } = await getAdminDataClient();
  const resolvedAt = parsed.data.status === "resolved" || parsed.data.status === "closed"
    ? new Date().toISOString()
    : null;

  const patch = {
    status: parsed.data.status,
    priority: parsed.data.priority,
    assigned_admin_user_id: parsed.data.assignedAdminUserId || null,
    admin_notes: parsed.data.adminNotes || null,
    resolved_at: resolvedAt,
    updated_at: new Date().toISOString(),
  };

  const { error } = await client.from("support_tickets").update(patch).eq("id", parsed.data.id);

  if (error) {
    redirect(withMessage("/admin/support", "error", error.message));
  }

  await audit({
    action: "support_ticket_updated",
    targetType: "support_ticket",
    targetId: parsed.data.id,
    actorUserId: admin.user.id,
    meta: patch,
  });

  revalidatePath("/admin/support");
  redirect(withMessage("/admin/support", "success", "Support ticket updated"));
}

const upsertAdminSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(ADMIN_ROLES),
});

const changeAdminRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ADMIN_ROLES),
});

const disableAdminSchema = z.object({
  userId: z.string().uuid(),
});

async function getSingleRoleForUser(client: any, userId: string): Promise<AdminRole | null> {
  const { data } = await client
    .from("admin_role_members")
    .select("role_key")
    .eq("user_id", userId);

  if (!Array.isArray(data) || !data.length) return null;
  const ordered = data
    .map((row) => String(row?.role_key || "").trim())
    .filter((role): role is AdminRole => (ADMIN_ROLES as readonly string[]).includes(role))
    .sort((a, b) => ADMIN_ROLES.indexOf(b as AdminRole) - ADMIN_ROLES.indexOf(a as AdminRole));
  return ordered[0] || null;
}

async function countSuperAdmins(client: any): Promise<number> {
  const { count } = await client
    .from("admin_role_members")
    .select("user_id", { count: "exact", head: true })
    .eq("role_key", "admin_super");
  return Number(count || 0);
}

async function setAdminRoleSingle(
  client: any,
  userId: string,
  role: AdminRole,
  actorUserId: string
) {
  const { error: deleteError } = await client.from("admin_role_members").delete().eq("user_id", userId);
  if (deleteError) throw new Error(deleteError.message || "Failed to clear prior admin roles");

  const { error: insertError } = await client.from("admin_role_members").insert({
    user_id: userId,
    role_key: role,
    granted_by: actorUserId,
  });
  if (insertError) throw new Error(insertError.message || "Failed to assign admin role");
}

export async function upsertAdminAccountAction(formData: FormData) {
  const admin = await requireAdminAnyRole(["admin_super"]);
  const parsed = upsertAdminSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    redirect(withMessage("/admin/admins", "error", "Invalid admin create payload"));
  }

  const email = parsed.data.email.trim().toLowerCase();
  const role = parsed.data.role;
  const serviceClient = getAdminServiceRoleClient();

  let targetUserId: string | null = null;
  const { data: existing } = await serviceClient
    .from("users")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();
  if (existing?.id) {
    targetUserId = existing.id;
  } else {
    const inviteResult = await serviceClient.auth.admin.inviteUserByEmail(email);
    if (inviteResult.error || !inviteResult.data.user?.id) {
      redirect(withMessage("/admin/admins", "error", inviteResult.error?.message || "Failed to invite admin"));
    }
    targetUserId = inviteResult.data.user.id;
  }

  const { error: upsertUserError } = await serviceClient.from("users").upsert(
    {
      id: targetUserId,
      email,
      role: "admin",
      is_internal: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id", ignoreDuplicates: false }
  );

  if (upsertUserError) {
    redirect(withMessage("/admin/admins", "error", upsertUserError.message));
  }

  const priorRole = await getSingleRoleForUser(serviceClient, targetUserId);
  try {
    await setAdminRoleSingle(serviceClient, targetUserId, role, admin.user.id);
  } catch (error: any) {
    redirect(withMessage("/admin/admins", "error", error?.message || "Failed to assign admin role"));
  }

  await audit({
    action: existing?.id ? "admin_role_changed" : "admin_user_invited",
    targetType: "admin_user",
    targetId: targetUserId,
    actorUserId: admin.user.id,
    meta: {
      email,
      previous_role: priorRole,
      new_role: role,
      source: existing?.id ? "existing_user" : "invite",
    },
  });

  revalidatePath("/admin/admins");
  revalidatePath(`/admin/users/${targetUserId}`);
  redirect(withMessage("/admin/admins", "success", existing?.id ? "Admin role updated" : "Admin invited"));
}

export async function changeAdminRoleAction(formData: FormData) {
  const admin = await requireAdminAnyRole(["admin_super"]);
  const parsed = changeAdminRoleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    redirect(withMessage("/admin/admins", "error", "Invalid admin role payload"));
  }

  const serviceClient = getAdminServiceRoleClient();
  const currentRole = await getSingleRoleForUser(serviceClient, parsed.data.userId);
  const nextRole = parsed.data.role;

  if (!currentRole) {
    redirect(withMessage("/admin/admins", "error", "Target user is not currently an admin"));
  }

  if (currentRole === "admin_super" && nextRole !== "admin_super") {
    const superCount = await countSuperAdmins(serviceClient);
    if (superCount <= 1) {
      redirect(withMessage("/admin/admins", "error", "Cannot demote the last admin_super"));
    }
  }

  try {
    await setAdminRoleSingle(serviceClient, parsed.data.userId, nextRole, admin.user.id);
  } catch (error: any) {
    redirect(withMessage("/admin/admins", "error", error?.message || "Failed to change admin role"));
  }

  await audit({
    action: "admin_role_changed",
    targetType: "admin_user",
    targetId: parsed.data.userId,
    actorUserId: admin.user.id,
    meta: {
      previous_role: currentRole,
      new_role: nextRole,
    },
  });

  revalidatePath("/admin/admins");
  revalidatePath(`/admin/users/${parsed.data.userId}`);
  redirect(withMessage("/admin/admins", "success", "Admin role updated"));
}

export async function disableAdminAccessAction(formData: FormData) {
  const admin = await requireAdminAnyRole(["admin_super"]);
  const parsed = disableAdminSchema.safeParse({
    userId: formData.get("userId"),
  });

  if (!parsed.success) {
    redirect(withMessage("/admin/admins", "error", "Invalid disable payload"));
  }

  const serviceClient = getAdminServiceRoleClient();
  const currentRole = await getSingleRoleForUser(serviceClient, parsed.data.userId);
  if (!currentRole) {
    redirect(withMessage("/admin/admins", "error", "Admin access is already disabled"));
  }

  if (currentRole === "admin_super") {
    const superCount = await countSuperAdmins(serviceClient);
    if (superCount <= 1) {
      redirect(withMessage("/admin/admins", "error", "Cannot disable the last admin_super"));
    }
  }

  const { error: deleteError } = await serviceClient
    .from("admin_role_members")
    .delete()
    .eq("user_id", parsed.data.userId);
  if (deleteError) {
    redirect(withMessage("/admin/admins", "error", deleteError.message));
  }

  const { data: userRow } = await serviceClient
    .from("users")
    .select("role")
    .eq("id", parsed.data.userId)
    .maybeSingle();
  const updates: Record<string, unknown> = {
    is_internal: false,
    updated_at: new Date().toISOString(),
  };
  if (userRow?.role === "admin") {
    updates.role = "customer";
  }
  await serviceClient.from("users").update(updates).eq("id", parsed.data.userId);

  await audit({
    action: "admin_access_disabled",
    targetType: "admin_user",
    targetId: parsed.data.userId,
    actorUserId: admin.user.id,
    meta: {
      previous_role: currentRole,
      disabled: true,
    },
  });

  revalidatePath("/admin/admins");
  revalidatePath(`/admin/users/${parsed.data.userId}`);
  redirect(withMessage("/admin/admins", "success", "Admin access disabled"));
}

const startImpersonationSchema = z.object({
  targetUserId: z.string().uuid(),
  minutes: z.coerce.number().int().min(1).max(480).default(30),
  reason: z.string().min(3).max(500),
});

export async function startImpersonationAction(formData: FormData) {
  const diagEnabled = String(process.env.NEXT_PUBLIC_AUTH_DIAG || "") === "1";
  const admin = await requireAdminAnyRole(["admin_support", "admin_super"]);
  const parsed = startImpersonationSchema.safeParse({
    targetUserId: formData.get("targetUserId"),
    minutes: formData.get("minutes") || 30,
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    redirect(withMessage("/admin/impersonation", "error", "Invalid impersonation payload"));
  }

  // Reset stale support-mode cookies before starting a new session to avoid mixed targets.
  await clearSupportModeCookies();

  const authedClient = await getSupabaseServerAuthedClient();
  if (!authedClient) {
    redirect(withMessage("/admin/impersonation", "error", "Unable to initialize authenticated session"));
  }

  if (diagEnabled) {
    console.warn("[AUTH_DIAG] startImpersonation:rpc_client", {
      clientType: "authed",
      actorUserId: admin.user.id,
      targetUserId: parsed.data.targetUserId,
    });
  }

  const { data, error } = await authedClient.rpc("create_impersonation_session", {
    target_user_id: parsed.data.targetUserId,
    minutes: parsed.data.minutes,
    reason: parsed.data.reason,
    meta: {
      source: "admin_ui",
      actor_user_id: admin.user.id,
      target_type: "user",
      target_id: parsed.data.targetUserId,
    },
  });

  const createSchemaBehind =
    String(error?.code || "") === "42703" &&
    String(error?.message || "").toLowerCase().includes("target_role");

  if (error || !data) {
    const message = createSchemaBehind
      ? "Support mode schema not deployed (missing target_role). Run migrations."
      : error?.message || "Failed to create session";
    redirect(withMessage("/admin/impersonation", "error", message));
  }

  const { data: createdSession, error: validationError } = await authedClient.rpc(
    "get_impersonation_session",
    {
      p_session_id: data,
    }
  );
  const createdSessionRow = (Array.isArray(createdSession) ? createdSession[0] : createdSession) as
    | {
        session_id?: string | null;
        target_user_id?: string | null;
        target_role?: string | null;
        is_active?: boolean | null;
      }
    | null;

  console.warn("[support-mode][start]", {
    requestedTargetUserId: parsed.data.targetUserId,
    dbTargetUserId: createdSessionRow?.target_user_id ?? null,
    sessionId: createdSessionRow?.session_id ?? data ?? null,
    targetRole: createdSessionRow?.target_role ?? null,
    actorUserId: admin.user.id,
  });

  if (diagEnabled) {
    console.warn("[AUTH_DIAG] startImpersonation:validate_session", {
      clientType: "authed",
      actorUserId: admin.user.id,
      sessionId: data,
      rpcErrorCode: validationError?.code || null,
      rpcErrorMessage: validationError?.message || null,
      rowReturned: Boolean(createdSessionRow),
      isActive: createdSessionRow?.is_active ?? null,
      targetRole: createdSessionRow?.target_role ?? null,
    });
  }

  const validationSchemaBehind =
    String(validationError?.code || "") === "42703" &&
    String(validationError?.message || "").toLowerCase().includes("target_role");

  if (validationError || !createdSessionRow || createdSessionRow.is_active !== true) {
    await clearSupportModeCookies();
    redirect(
      withMessage(
        "/admin/impersonation",
        "error",
        validationSchemaBehind
          ? "Support mode schema not deployed (missing target_role). Run migrations."
          : validationError?.message || "Support session could not be validated"
      )
    );
  }

  const targetRole = createdSessionRow?.target_role === "business" ? "business" : "customer";

  const secure = await shouldUseSecureCookies();
  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATE_USER_COOKIE, parsed.data.targetUserId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: parsed.data.minutes * 60,
  });
  cookieStore.set(IMPERSONATE_SESSION_COOKIE, data, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: parsed.data.minutes * 60,
  });
  cookieStore.set(IMPERSONATE_TARGET_ROLE_COOKIE, targetRole, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: parsed.data.minutes * 60,
  });
  if (diagEnabled) {
    const jar = await cookies();
    console.warn("[support-mode][start][cookies-after-set]", {
      sessionId: jar.get(IMPERSONATE_SESSION_COOKIE)?.value || null,
      targetUserId: jar.get(IMPERSONATE_USER_COOKIE)?.value || null,
      hasTargetRoleCookie: Boolean(jar.get(IMPERSONATE_TARGET_ROLE_COOKIE)?.value),
    });
  }

  revalidatePath("/admin");
  redirect(withMessage("/admin/impersonation", "success", "Support mode started"));
}

const stopImpersonationSchema = z.object({
  sessionId: z.string().uuid().optional(),
  returnTo: z.string().optional(),
});

export async function stopImpersonationAction(formData?: FormData) {
  const admin = await requireAdmin();
  const cookieState = await readSupportModeCookies();
  const sessionIdFromCookie = cookieState.sessionId || undefined;
  const targetUserFromCookie = cookieState.targetUserId || undefined;

  const parsed = stopImpersonationSchema.safeParse({
    sessionId: formData?.get("sessionId") || sessionIdFromCookie || undefined,
    returnTo: (formData?.get("returnTo") || "").toString() || undefined,
  });

  const safeReturnTo = getSafeRedirectPath(parsed.success ? parsed.data.returnTo : null) || "/admin";

  if (!parsed.success || !parsed.data.sessionId) {
    await clearSupportModeCookies();
    redirect(withMessage(safeReturnTo, "error", "No active support mode found"));
  }

  const { client } = await getAdminDataClient();
  const endedAt = new Date().toISOString();
  const { error } = await client
    .from("admin_impersonation_sessions")
    .update({ active: false, ended_at: endedAt })
    .eq("id", parsed.data.sessionId)
    .eq("actor_user_id", admin.user.id);

  await clearSupportModeCookies();

  if (!error) {
    await audit({
      action: "impersonation_stop",
      targetType: "user",
      targetId: targetUserFromCookie || null,
      actorUserId: admin.user.id,
      meta: { session_id: parsed.data.sessionId, ended_at: endedAt },
    });
  }

  revalidatePath("/admin");
  redirect(withMessage(safeReturnTo, error ? "error" : "success", error ? error.message : "Support mode stopped"));
}

export async function goToImpersonatedHomeAction() {
  const diagEnabled = String(process.env.NEXT_PUBLIC_AUTH_DIAG || "") === "1";
  const admin = await requireAdmin({
    unauthenticatedRedirectTo: "/signin?modal=signin&next=/admin",
    unauthorizedRedirectTo: "/not-authorized",
  });
  const cookieState = await readSupportModeCookies();
  const jar = await cookies();
  if (diagEnabled) {
    console.warn("[support-mode][go-home][cookie-snapshot]", {
      sessionId: jar.get(IMPERSONATE_SESSION_COOKIE)?.value || null,
      targetUserId: jar.get(IMPERSONATE_USER_COOKIE)?.value || null,
    });
  }
  const secure = await shouldUseSecureCookies();
  if (diagEnabled) {
    console.warn("[AUTH_DIAG] goToImpersonatedHome:cookies", {
      actorUserId: admin.user.id,
      hasSessionCookie: Boolean(cookieState.sessionId),
      hasTargetCookie: Boolean(cookieState.targetUserId),
      secure,
    });
  }

  const session = await validateSupportModeSession(admin.user.id);
  if (!session.ok) {
    if (session.reason === "wrong-target") {
      await clearSupportModeCookies();
      const reasonParam = diagEnabled ? `&reason=${encodeURIComponent(session.reason)}` : "";
      redirect(
        `/admin/impersonation?error=${encodeURIComponent(
          "Support mode target mismatch (stale cookies). Please start support mode again."
        )}${reasonParam}`
      );
    }
    if (session.reason === "schema-not-deployed") {
      redirect("/admin/impersonation?error=Support%20mode%20schema%20not%20deployed%20%28missing%20target_role%29.%20Run%20migrations.");
    }
    const reasonParam = diagEnabled ? `&reason=${encodeURIComponent(session.reason)}` : "";
    if (diagEnabled) {
      console.warn("[AUTH_DIAG] goToImpersonatedHome:no_support_mode", {
        actorUserId: admin.user.id,
        reason: session.reason,
        sessionId: session.sessionId,
        targetUserId: session.targetUserId,
      });
    }
    redirect(`/admin/impersonation?error=no-support-mode${reasonParam}`);
  }

  const resolved = await getEffectiveActorAndTarget(admin.user.id);
  if (!resolved.supportMode) {
    const reasonParam = diagEnabled ? `&reason=${encodeURIComponent(resolved.reason)}` : "";
    redirect(`/admin/impersonation?error=no-support-mode${reasonParam}`);
  }

  if (resolved.targetRole === "business") {
    redirect("/business/dashboard");
  }
  if (resolved.targetRole === "customer") {
    redirect("/customer/home");
  }
  redirect("/admin/impersonation?error=missing-target-role");
}

export async function adminLogoutAction() {
  await requireAdmin({
    unauthenticatedRedirectTo: "/",
    unauthorizedRedirectTo: "/",
  });

  const supabase = await getSupabaseServerClient();
  await supabase?.auth?.signOut();
  await clearAllAuthCookies();
  revalidatePath("/");
  redirect("/?signedout=1");
}

/*
MANUAL REGRESSION CHECKLIST
1) Start support mode for customer target, click \"Go to user home\", confirm /customer/home loads.
2) Start support mode for business target, click \"Go to user home\", confirm /business/dashboard loads.
3) Start support mode for User A, then start for User B; confirm new session works and no mixed-cookie wrong-target state.
4) Manually tamper yb_impersonate_user_id cookie to mismatch DB target; click \"Go to user home\" and confirm cookies clear + restart message.
5) Click admin logout once, confirm redirect to /?signedout=1 with public navbar and no avatar.
6) Refresh / and revisit protected routes, confirm session is fully cleared.
*/
