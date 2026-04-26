import "server-only";

import { parseEntityDisplayId, normalizeIdValue, stripKnownEntityPrefix, getEntityIdSearchVariants } from "@/lib/entityIds";
import { isUuid } from "@/lib/ids/isUuid";
import { getAdminDataClient } from "@/lib/supabase/admin";

const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 50;

type SearchEntityKind = "listing" | "order" | "uuid" | "text";

type AdminListingBusinessSummary = {
  id: string | null;
  public_id: string | null;
  business_name: string | null;
};

type AdminListingRecentOrder = {
  id: string;
  order_number: string | null;
  status: string | null;
  created_at: string | null;
};

export type AdminListingRow = {
  id: string;
  public_id: string | null;
  title: string | null;
  business_id: string | null;
  business: AdminListingBusinessSummary | null;
  status: string;
  status_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  inventory_quantity: number | null;
  inventory_status: string | null;
  inventory_type: string | null;
  low_stock_threshold: number | null;
  inventory_last_updated_at: string | null;
  is_internal: boolean;
  is_seeded: boolean;
  is_published: boolean | null;
  is_active: boolean | null;
  related_order_count: number;
  recent_orders: AdminListingRecentOrder[];
};

type AdminListingSearchDescriptor = {
  raw: string;
  normalized: string;
  stripped: string;
  kind: SearchEntityKind;
  entityType: ReturnType<typeof parseEntityDisplayId>["type"];
};

type SearchResolvers<T> = {
  findListingByPublicId: (publicId: string) => Promise<T[]>;
  findListingByUuid: (uuid: string) => Promise<T[]>;
  findListingByOrderRef: (input: string) => Promise<T[]>;
  searchListingsByText: (input: string) => Promise<T[]>;
};

function sanitizeSearchTerm(value: string) {
  return value.replace(/[%(),]/g, " ").trim();
}

function toNullableString(value: unknown) {
  const stringValue = typeof value === "string" ? value.trim() : "";
  return stringValue || null;
}

function toNullableNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  return null;
}

function dedupeRows<T extends { id?: string | null }>(rows: T[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const id = String(row?.id || "").trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function resolveAdminListingSearchDescriptor(input: unknown): AdminListingSearchDescriptor {
  const raw = typeof input === "string" ? input.trim() : "";
  const parsed = parseEntityDisplayId(raw);
  const normalized = normalizeIdValue(raw);
  const stripped = stripKnownEntityPrefix(raw);

  if (parsed?.type === "listing" || parsed?.type === "sku") {
    return {
      raw,
      normalized,
      stripped,
      kind: "listing",
      entityType: parsed.type,
    };
  }

  if (parsed?.type === "order" || (parsed?.type === null && parsed?.hasKnownPrefix)) {
    return {
      raw,
      normalized,
      stripped,
      kind: "order",
      entityType: parsed?.type ?? null,
    };
  }

  if (raw && isUuid(raw)) {
    return {
      raw,
      normalized,
      stripped,
      kind: "uuid",
      entityType: parsed?.type ?? null,
    };
  }

  return {
    raw,
    normalized,
    stripped,
    kind: "text",
    entityType: parsed?.type ?? null,
  };
}

export async function searchAdminListingsWithResolvers<T extends { id?: string | null }>(
  input: string,
  resolvers: SearchResolvers<T>
) {
  const descriptor = resolveAdminListingSearchDescriptor(input);
  if (!descriptor.raw) return [];

  if (descriptor.kind === "listing" && descriptor.normalized) {
    return dedupeRows(await resolvers.findListingByPublicId(descriptor.normalized));
  }

  if (descriptor.kind === "uuid") {
    const exact = await resolvers.findListingByUuid(descriptor.raw);
    if (exact.length) return dedupeRows(exact);
  }

  if (descriptor.normalized) {
    const exactListing = await resolvers.findListingByPublicId(descriptor.normalized);
    if (exactListing.length) return dedupeRows(exactListing);
  }

  if (descriptor.kind === "order" || descriptor.normalized) {
    const fromOrder = await resolvers.findListingByOrderRef(descriptor.raw);
    if (fromOrder.length) return dedupeRows(fromOrder);
  }

  return dedupeRows(await resolvers.searchListingsByText(descriptor.raw));
}

function computeListingStatus(row: Record<string, any>) {
  const deletedAt = toNullableString(row?.deleted_at);
  const status = toNullableString(row?.status)?.toLowerCase() || null;
  const isPublished = toNullableBoolean(row?.is_published);
  const isActive = toNullableBoolean(row?.is_active);

  if (deletedAt) {
    return { status: "deleted", reason: "deleted_at is set" };
  }
  if (status === "draft") {
    return { status: "draft", reason: "status is draft" };
  }
  if (isPublished === false) {
    return { status: "hidden", reason: "is_published is false" };
  }
  if (isActive === false) {
    return { status: "hidden", reason: "is_active is false" };
  }
  if (status === "published") {
    return { status: "active", reason: "status is published" };
  }
  if (status && status !== "active") {
    return { status, reason: `status is ${status}` };
  }
  return { status: "active", reason: null };
}

function mapListingRow(row: Record<string, any>, businessById: Map<string, AdminListingBusinessSummary>, orderMetaByListingId: Map<string, { count: number; recent: AdminListingRecentOrder[] }>): AdminListingRow {
  const listingId = String(row?.id || "").trim();
  const listingStatus = computeListingStatus(row);
  const businessId = toNullableString(row?.business_id);
  const orderMeta = orderMetaByListingId.get(listingId);

  return {
    id: listingId,
    public_id: toNullableString(row?.public_id),
    title: toNullableString(row?.title),
    business_id: businessId,
    business: businessId ? businessById.get(businessId) || null : null,
    status: listingStatus.status,
    status_reason: listingStatus.reason,
    created_at: toNullableString(row?.created_at),
    updated_at: toNullableString(row?.updated_at),
    deleted_at: toNullableString(row?.deleted_at),
    inventory_quantity: toNullableNumber(row?.inventory_quantity),
    inventory_status: toNullableString(row?.inventory_status),
    inventory_type: toNullableString(row?.inventory_type),
    low_stock_threshold: toNullableNumber(row?.low_stock_threshold),
    inventory_last_updated_at: toNullableString(row?.inventory_last_updated_at),
    is_internal: row?.is_internal === true,
    is_seeded: row?.is_seeded === true,
    is_published: toNullableBoolean(row?.is_published),
    is_active: toNullableBoolean(row?.is_active),
    related_order_count: orderMeta?.count || 0,
    recent_orders: orderMeta?.recent || [],
  };
}

async function enrichAdminListings(client: any, listings: Record<string, any>[]) {
  const listingIds = listings.map((row) => String(row?.id || "")).filter(Boolean);
  const businessIds = listings.map((row) => String(row?.business_id || "")).filter(Boolean);

  const businessById = new Map<string, AdminListingBusinessSummary>();
  if (businessIds.length) {
    const { data: businesses } = await client
      .from("businesses")
      .select("owner_user_id, public_id, business_name")
      .in("owner_user_id", Array.from(new Set(businessIds)));

    for (const business of Array.isArray(businesses) ? businesses : []) {
      const id = String(business?.owner_user_id || "").trim();
      if (!id) continue;
      businessById.set(id, {
        id,
        public_id: toNullableString(business?.public_id),
        business_name: toNullableString(business?.business_name),
      });
    }
  }

  const orderMetaByListingId = new Map<string, { count: number; recent: AdminListingRecentOrder[] }>();
  if (listingIds.length) {
    const { data: orderItems } = await client
      .from("order_items")
      .select("listing_id, order:orders!order_items_order_id_fkey(id, order_number, status, created_at)")
      .in("listing_id", listingIds);

    const grouped = new Map<string, AdminListingRecentOrder[]>();
    for (const item of Array.isArray(orderItems) ? orderItems : []) {
      const listingId = String(item?.listing_id || "").trim();
      const order = item?.order;
      const orderId = String(order?.id || "").trim();
      if (!listingId || !orderId) continue;
      const current = grouped.get(listingId) || [];
      current.push({
        id: orderId,
        order_number: toNullableString(order?.order_number),
        status: toNullableString(order?.status),
        created_at: toNullableString(order?.created_at),
      });
      grouped.set(listingId, current);
    }

    for (const [listingId, orders] of grouped.entries()) {
      orders.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      orderMetaByListingId.set(listingId, {
        count: orders.length,
        recent: orders.slice(0, 3),
      });
    }
  }

  return listings.map((row) => mapListingRow(row, businessById, orderMetaByListingId));
}

async function findListingsByPublicId(client: any, publicId: string) {
  const normalized = String(publicId || "").trim().toLowerCase();
  if (!normalized) return [];
  const { data } = await client
    .from("listings")
    .select("*")
    .ilike("public_id", normalized)
    .limit(20);
  return Array.isArray(data) ? data : [];
}

async function findListingsByUuid(client: any, uuid: string) {
  const { data } = await client
    .from("listings")
    .select("*")
    .eq("id", uuid)
    .limit(20);
  return Array.isArray(data) ? data : [];
}

async function findListingsByOrderRef(client: any, input: string) {
  const variants = getEntityIdSearchVariants("order", input);
  if (!variants.length) return [];

  const { data: orders } = await client
    .from("orders")
    .select("id")
    .or(variants.map((variant) => `order_number.ilike.${variant}`).join(","))
    .limit(20);

  const orderIds = (Array.isArray(orders) ? orders : [])
    .map((row) => String(row?.id || "").trim())
    .filter(Boolean);

  if (!orderIds.length) return [];

  const { data: orderItems } = await client
    .from("order_items")
    .select("listing_id")
    .in("order_id", orderIds);

  const listingIds = Array.from(
    new Set(
      (Array.isArray(orderItems) ? orderItems : [])
        .map((row) => String(row?.listing_id || "").trim())
        .filter(Boolean)
    )
  );

  if (!listingIds.length) return [];

  const { data: listings } = await client
    .from("listings")
    .select("*")
    .in("id", listingIds)
    .limit(20);

  return Array.isArray(listings) ? listings : [];
}

async function searchListingsByText(client: any, input: string, limit: number) {
  const search = sanitizeSearchTerm(input);
  if (!search) return [];

  const [listingMatches, businessMatches] = await Promise.all([
    client
      .from("listings")
      .select("*")
      .or(`title.ilike.%${search}%,public_id.ilike.%${search}%`)
      .order("created_at", { ascending: false })
      .limit(limit),
    client
      .from("businesses")
      .select("owner_user_id")
      .ilike("business_name", `%${search}%`)
      .limit(limit),
  ]);

  const rows = Array.isArray(listingMatches.data) ? listingMatches.data : [];
  const businessIds = (Array.isArray(businessMatches.data) ? businessMatches.data : [])
    .map((row: any) => String(row?.owner_user_id || "").trim())
    .filter(Boolean);

  let businessListings: Record<string, any>[] = [];
  if (businessIds.length) {
    const { data } = await client
      .from("listings")
      .select("*")
      .in("business_id", Array.from(new Set(businessIds)))
      .order("created_at", { ascending: false })
      .limit(limit);
    businessListings = Array.isArray(data) ? data : [];
  }

  return dedupeRows([...rows, ...businessListings]).slice(0, limit);
}

export async function searchAdminListings(input: string, limit = DEFAULT_SEARCH_LIMIT): Promise<AdminListingRow[]> {
  const trimmed = String(input || "").trim();
  if (!trimmed) return [];

  const resolvedLimit = Math.min(MAX_SEARCH_LIMIT, Math.max(1, Number(limit) || DEFAULT_SEARCH_LIMIT));
  const { client } = await getAdminDataClient({ mode: "service" });

  const listings = await searchAdminListingsWithResolvers(trimmed, {
    findListingByPublicId: (publicId) => findListingsByPublicId(client, publicId),
    findListingByUuid: (uuid) => findListingsByUuid(client, uuid),
    findListingByOrderRef: (orderRef) => findListingsByOrderRef(client, orderRef),
    searchListingsByText: (query) => searchListingsByText(client, query, resolvedLimit),
  });

  return enrichAdminListings(client, listings.slice(0, resolvedLimit));
}

export async function setAdminListingVisibility({
  listingId,
  hidden,
  actorUserId,
}: {
  listingId: string;
  hidden: boolean;
  actorUserId: string;
}) {
  const { client } = await getAdminDataClient({ mode: "service" });
  const nowIso = new Date().toISOString();

  const { data: current, error: currentError } = await client
    .from("listings")
    .select("*")
    .eq("id", listingId)
    .maybeSingle();

  if (currentError || !current?.id) {
    throw new Error("Listing not found.");
  }

  const updates: Record<string, unknown> = {};
  if ("deleted_at" in current) {
    updates.deleted_at = hidden ? nowIso : null;
  }
  if ("is_published" in current) {
    updates.is_published = hidden ? false : true;
  }
  if ("is_active" in current) {
    updates.is_active = hidden ? false : true;
  }
  if ("status" in current) {
    const currentStatus = String(current.status || "").trim().toLowerCase();
    updates.status = hidden ? "hidden" : currentStatus === "draft" ? "draft" : "published";
  }
  if ("updated_at" in current) {
    updates.updated_at = nowIso;
  }

  const { data: updated, error } = await client
    .from("listings")
    .update(updates)
    .eq("id", listingId)
    .select("*")
    .maybeSingle();

  if (error || !updated?.id) {
    throw new Error(error?.message || "Failed to update listing visibility.");
  }

  await client.rpc("log_admin_action", {
    p_action: hidden ? "listing_hidden" : "listing_unhidden",
    p_actor_user_id: actorUserId,
    p_target_type: "listing",
    p_target_id: listingId,
    p_meta: {
      listing_id: listingId,
      public_id: updated.public_id || null,
      hidden,
      previous_status: computeListingStatus(current).status,
      next_status: computeListingStatus(updated).status,
    },
  });

  const enriched = await enrichAdminListings(client, [updated]);
  return enriched[0] || null;
}
