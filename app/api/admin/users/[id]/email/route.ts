import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/admin/audit";
import { requireAdminApiRole } from "@/lib/admin/requireAdminApiRole";
import { getAdminServiceRoleClient } from "@/lib/supabase/admin";

const updateEmailSchema = z.object({
  newEmail: z.string().email().max(320),
  reason: z.string().trim().min(10).max(500),
});
const paramsSchema = z.object({
  id: z.string().uuid(),
});

function getRequestIp(request: NextRequest): string | null {
  const fromHeader = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "";
  const first = fromHeader.split(",")[0]?.trim() || "";
  return first || null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApiRole("admin_super");
  if (auth.ok === false) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid target user id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateEmailSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const normalizedTargetUserId = parsedParams.data.id;

  const newEmail = parsed.data.newEmail.trim().toLowerCase();
  const reason = parsed.data.reason.trim();
  const adminClient = getAdminServiceRoleClient();

  const { data: before, error: beforeError } = await adminClient.auth.admin.getUserById(normalizedTargetUserId);
  if (beforeError) {
    return NextResponse.json({ error: beforeError.message || "Unable to load target user" }, { status: 400 });
  }
  if (!before?.user) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }

  const oldEmail = before.user.email || null;
  const updateResult = await adminClient.auth.admin.updateUserById(normalizedTargetUserId, { email: newEmail });
  if (updateResult.error) {
    return NextResponse.json({ error: updateResult.error.message || "Failed to update email" }, { status: 500 });
  }

  let signOutError: string | null = null;
  const signOutFn = (adminClient.auth.admin as { signOut?: (userId: string) => Promise<{ error?: { message?: string } }> })
    ?.signOut;
  if (typeof signOutFn === "function") {
    const signOutResult = await signOutFn(normalizedTargetUserId);
    signOutError = signOutResult?.error?.message || null;
  }

  const meta = {
    reason,
    oldEmail,
    newEmail,
    requesterAdminId: auth.actorUser.id,
    requesterAdminEmail: auth.actorUser.email,
    requestIp: getRequestIp(request),
    requestUserAgent: request.headers.get("user-agent") || null,
    signOutError,
  };

  await audit({
    action: "admin.user.update_email",
    targetType: "user",
    targetId: normalizedTargetUserId,
    actorUserId: auth.actorUser.id,
    meta,
  });

  return NextResponse.json({ success: true, userId: normalizedTargetUserId, oldEmail, newEmail });
}
