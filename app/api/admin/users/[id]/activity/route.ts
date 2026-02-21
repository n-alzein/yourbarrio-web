import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerAuthedClient } from "@/lib/supabaseServer";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  action: z.string().trim().max(200).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  include_actor: z
    .string()
    .optional()
    .transform((value) => value !== "0"),
  include_target: z
    .string()
    .optional()
    .transform((value) => value !== "0"),
});

function isPermissionError(message: string, code: string | null | undefined) {
  const normalized = message.toLowerCase();
  return code === "42501" || normalized.includes("insufficient permissions") || normalized.includes("not authenticated");
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid target user id" }, { status: 400 });
  }

  const parsedQuery = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!parsedQuery.success) {
    return NextResponse.json({ error: "Invalid query params" }, { status: 400 });
  }

  const authedClient = await getSupabaseServerAuthedClient();
  if (!authedClient) {
    return NextResponse.json({ error: "Authentication client unavailable" }, { status: 500 });
  }

  const {
    data: { user },
    error: authError,
  } = await authedClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = parsedQuery.data;
  const { data, error } = await authedClient.rpc("admin_list_user_audit_activity", {
    p_user_id: parsedParams.data.id,
    p_include_actor: query.include_actor,
    p_include_target: query.include_target,
    p_q: query.q || null,
    p_action: query.action || null,
    p_offset: query.offset,
    p_limit: query.limit,
  });

  if (error) {
    if (isPermissionError(error.message || "", error.code)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message || "Unable to list activity" }, { status: 500 });
  }

  const rows = Array.isArray(data) ? data : [];
  const totalCount = rows.length ? Number(rows[0]?.total_count || 0) : 0;

  return NextResponse.json(
    {
      rows,
      totalCount,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
