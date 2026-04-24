import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiRole } from "@/lib/admin/requireAdminApiRole";
import { searchAdminListings } from "@/lib/admin/listings";

const querySchema = z.object({
  q: z.string().trim().max(200).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiRole("admin_readonly");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query params." }, { status: 400 });
  }

  const { q, limit } = parsed.data;
  const rows = await searchAdminListings(q, limit);

  return NextResponse.json(
    {
      rows,
      totalCount: rows.length,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
