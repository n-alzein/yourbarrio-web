import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin/permissions";
import { getAdminDataClient } from "@/lib/supabase/admin";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 10;

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

export async function GET(request: Request) {
  await requireAdminRole("admin_readonly");
  const { searchParams } = new URL(request.url);
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const requestedSize = parsePositiveInt(searchParams.get("page_size"), DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(requestedSize, MAX_PAGE_SIZE);
  const from = (page - 1) * pageSize;
  const to = from + pageSize;

  const { client } = await getAdminDataClient();
  const { data, error } = await client
    .from("admin_audit_log")
    .select("id, action, target_type, target_id, actor_user_id, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to load audit activity" },
      { status: 500 }
    );
  }

  const rows = (data || []).slice(0, pageSize);
  const hasMore = (data || []).length > pageSize;

  return NextResponse.json(
    {
      rows,
      page,
      hasMore,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
