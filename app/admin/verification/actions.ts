"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import {
  PENDING_VERIFICATION_COUNT_CACHE_TAG,
  setBusinessVerificationStatus,
} from "@/lib/admin/businessVerification";

type VerificationActionResult =
  | { ok: true }
  | { ok: false; error: string };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeOwnerUserId(value: string) {
  return String(value || "").trim().toLowerCase();
}

function revalidateAdminVerificationSurfaces(ownerUserId: string) {
  revalidateTag(PENDING_VERIFICATION_COUNT_CACHE_TAG, "max");
  revalidatePath("/admin");
  revalidatePath("/admin/businesses");
  revalidatePath("/admin/verification");
  revalidatePath(`/admin/users/${ownerUserId}`);
}

async function updateVerification(
  owner_user_id: string,
  next_status: "manually_verified" | "suspended" | "pending"
): Promise<VerificationActionResult> {
  const ownerUserId = normalizeOwnerUserId(owner_user_id);
  if (!UUID_REGEX.test(ownerUserId)) {
    return { ok: false, error: "Invalid owner_user_id" };
  }

  try {
    await setBusinessVerificationStatus({
      owner_user_id: ownerUserId,
      next_status,
    });
    revalidateAdminVerificationSurfaces(ownerUserId);
    return { ok: true };
  } catch (error: any) {
    return {
      ok: false,
      error: error?.message || "Failed to update business verification status",
    };
  }
}

export async function approveBusiness(owner_user_id: string): Promise<VerificationActionResult> {
  return updateVerification(owner_user_id, "manually_verified");
}

export async function suspendBusiness(owner_user_id: string): Promise<VerificationActionResult> {
  return updateVerification(owner_user_id, "suspended");
}

export async function resetBusiness(owner_user_id: string): Promise<VerificationActionResult> {
  return updateVerification(owner_user_id, "pending");
}
