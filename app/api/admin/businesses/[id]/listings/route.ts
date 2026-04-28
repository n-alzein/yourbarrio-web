import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_BUSINESS_LISTINGS_PAGE_SIZE,
  listAdminBusinessListings,
} from "@/lib/admin/listings";
import { requireAdminApiRole } from "@/lib/admin/requireAdminApiRole";
import type { AdminApiAuthFailure } from "@/lib/admin/requireAdminApiRole";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const searchParamsSchema = z.object({
  q: z.string().optional(),
  status: z.enum(["all", "draft", "published"]).optional(),
  visibility: z.enum(["all", "visible", "admin_hidden"]).optional(),
  internal: z.enum(["all", "internal", "external"]).optional(),
  inventory: z.enum(["all", "in_stock", "out_of_stock"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApiRole("admin_readonly");
  if (!auth.ok) {
    const failure = auth as AdminApiAuthFailure;
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid business account id." }, { status: 400 });
  }

  const url = new URL(request.url);
  const parsedSearch = searchParamsSchema.safeParse({
    q: url.searchParams.get("q") || undefined,
    status: url.searchParams.get("status") || undefined,
    visibility: url.searchParams.get("visibility") || undefined,
    internal: url.searchParams.get("internal") || undefined,
    inventory: url.searchParams.get("inventory") || undefined,
    page: url.searchParams.get("page") || undefined,
    page_size: url.searchParams.get("page_size") || undefined,
  });

  if (!parsedSearch.success) {
    return NextResponse.json({ error: "Invalid listings query params." }, { status: 400 });
  }

  try {
    const result = await listAdminBusinessListings(parsedParams.data.id, {
      q: parsedSearch.data.q,
      status: parsedSearch.data.status || "all",
      visibility: parsedSearch.data.visibility || "all",
      internal: parsedSearch.data.internal || "all",
      inventory: parsedSearch.data.inventory || "all",
      page: parsedSearch.data.page || 1,
      pageSize: parsedSearch.data.page_size || ADMIN_BUSINESS_LISTINGS_PAGE_SIZE,
    });
    return NextResponse.json(
      result,
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load business listings." },
      { status: 500 }
    );
  }
}
