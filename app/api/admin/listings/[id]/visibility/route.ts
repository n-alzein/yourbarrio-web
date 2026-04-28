import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiRole } from "@/lib/admin/requireAdminApiRole";
import type { AdminApiAuthFailure } from "@/lib/admin/requireAdminApiRole";
import { setAdminListingVisibility } from "@/lib/admin/listings";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const bodySchema = z.object({
  hidden: z.boolean(),
  reason: z.string().trim().min(1, "Reason is required."),
});

export async function POST(
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
    return NextResponse.json({ error: "Invalid visibility payload." }, { status: 400 });
  }

  try {
    const row = await setAdminListingVisibility({
      listingId: parsedParams.data.id,
      hidden: parsedBody.data.hidden,
      actorUserId: auth.actorUser.id,
      reason: parsedBody.data.reason,
    });

    return NextResponse.json(
      {
        row,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to update listing visibility." },
      { status: 500 }
    );
  }
}
