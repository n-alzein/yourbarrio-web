import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiRole } from "@/lib/admin/requireAdminApiRole";
import type { AdminApiAuthFailure } from "@/lib/admin/requireAdminApiRole";
import { invokeFinalizeOverdueDeletions } from "@/lib/accountDeletion/invokeFinalizeOverdueDeletions";

const requestSchema = z.object({
  dryRun: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  userId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const auth = await requireAdminApiRole("admin_super");
  if (!auth.ok) {
    const failure = auth as AdminApiAuthFailure;
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  try {
    const payload = await invokeFinalizeOverdueDeletions({
      ...parsed.data,
      source: "admin_api",
    });
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to finalize overdue deletions." },
      { status: 500 },
    );
  }
}
