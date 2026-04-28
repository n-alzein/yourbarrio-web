import { NextResponse } from "next/server";
import { z } from "zod";
import {
  setAdminListingInternalState,
  setAdminListingVisibility,
} from "@/lib/admin/listings";
import { requireAdminApiRole } from "@/lib/admin/requireAdminApiRole";
import type { AdminApiAuthFailure } from "@/lib/admin/requireAdminApiRole";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set_visibility"),
    hidden: z.boolean(),
    reason: z.string().trim().min(1, "Reason is required."),
  }),
  z.object({
    action: z.literal("set_internal"),
    internal: z.boolean(),
    reason: z.string().trim().min(1, "Reason is required."),
  }),
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApiRole("admin_ops");
  if (!auth.ok) {
    const failure = auth as AdminApiAuthFailure;
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid listing id." }, { status: 400 });
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid listing action payload." }, { status: 400 });
  }

  try {
    const listingId = parsedParams.data.id;
    const actorUserId = auth.actorUser.id;
    let row = null;
    let message = "Listing updated.";

    if (parsedBody.data.action === "set_visibility") {
      row = await setAdminListingVisibility({
        listingId,
        hidden: parsedBody.data.hidden,
        actorUserId,
        reason: parsedBody.data.reason,
      });
      message = parsedBody.data.hidden ? "Listing hidden." : "Listing unhidden.";
    } else {
      row = await setAdminListingInternalState({
        listingId,
        internal: parsedBody.data.internal,
        actorUserId,
        reason: parsedBody.data.reason,
      });
      message = parsedBody.data.internal
        ? "Listing marked as internal/test."
        : "Listing internal/test flag removed.";
    }

    return NextResponse.json(
      { row, message },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to update listing." },
      { status: 500 }
    );
  }
}
