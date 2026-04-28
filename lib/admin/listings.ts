import "server-only";

import { parseEntityDisplayId, normalizeIdValue, stripKnownEntityPrefix, getEntityIdSearchVariants } from "@/lib/entityIds";
import { isUuid } from "@/lib/ids/isUuid";
import { logAdminAction } from "@/lib/admin/audit";
import { getAdminDataClient } from "@/lib/supabase/admin";

const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 50;
export const ADMIN_BUSINESS_LISTINGS_PAGE_SIZE = 20;
const MAX_ADMIN_BUSINESS_LISTINGS_PAGE_SIZE = 50;

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
  raw_status: string | null;
  status_reason: string | null;
  admin_hidden: boolean;
  visibility_state: "visible" | "admin_hidden" | "internal";
  inventory_state: "in_stock" | "out_of_stock" | "unknown";
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  price: number | null;
  photo_url: string | null;
  photo_variants: unknown;
  cover_image_id: string | null;
  has_unpublished_changes: boolean;
  inventory_quantity: number | null;
  inventory_status: string | null;
  inventory_type: string | null;
  low_stock_threshold: number | null;
  inventory_last_updated_at: string | null;
  is_internal: boolean;
  is_test: boolean | null;
  is_seeded: boolean;
  is_published: boolean | null;
  is_active: boolean | null;
  related_order_count: number;
  recent_orders: AdminListingRecentOrder[];
};

export type AdminBusinessListingsStatusFilter = "all" | "draft" | "published";
export type AdminBusinessListingsVisibilityFilter = "all" | "visible" | "admin_hidden";
export type AdminBusinessListingsInternalFilter = "all" | "internal" | "external";
export type AdminBusinessListingsInventoryFilter = "all" | "in_stock" | "out_of_stock";

export type AdminBusinessListingsFilters = {
  q?: string;
  status?: AdminBusinessListingsStatusFilter;
  visibility?: AdminBusinessListingsVisibilityFilter;
  internal?: AdminBusinessListingsInternalFilter;
  inventory?: AdminBusinessListingsInventoryFilter;
  page?: number;
  pageSize?: number;
};

export type AdminBusinessListingsResult = {
  rows: AdminListingRow[];
  totalCount: number;
  page: number;
  pageSize: number;
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
  const adminHidden = row?.admin_hidden === true;
  const isInternal = row?.is_internal === true || row?.is_test === true;

  if (adminHidden) {
    return { status: "hidden", reason: "admin_hidden is true" };
  }
  if (isInternal) {
    return { status: "internal", reason: "internal/test flag is true" };
  }
  if (deletedAt) {
    return { status: "deleted", reason: "deleted_at is set" };
  }
  if (status === "draft") {
    return { status: "draft", reason: "status is draft" };
  }
  if (status === "published") {
    return { status: "published", reason: "status is published" };
  }
  if (status) {
    return { status, reason: `status is ${status}` };
  }
  if (isPublished === false) {
    return { status: "unpublished", reason: "is_published is false" };
  }
  if (isActive === false) {
    return { status: "inactive", reason: "is_active is false" };
  }
  return { status: "active", reason: null };
}

function computeVisibilityState(row: Record<string, any>): AdminListingRow["visibility_state"] {
  if (row?.admin_hidden === true) return "admin_hidden";
  if (row?.is_internal === true || row?.is_test === true) return "internal";
  return "visible";
}

function computeInventoryState(row: Record<string, any>): AdminListingRow["inventory_state"] {
  const quantity = toNullableNumber(row?.inventory_quantity);
  const inventoryStatus = toNullableString(row?.inventory_status)?.toLowerCase() || null;
  if (typeof quantity === "number") {
    return quantity > 0 ? "in_stock" : "out_of_stock";
  }
  if (inventoryStatus === "out_of_stock") return "out_of_stock";
  if (inventoryStatus === "in_stock") return "in_stock";
  return "unknown";
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
    raw_status: toNullableString(row?.status)?.toLowerCase() || null,
    status_reason: listingStatus.reason,
    admin_hidden: row?.admin_hidden === true,
    visibility_state: computeVisibilityState(row),
    inventory_state: computeInventoryState(row),
    created_at: toNullableString(row?.created_at),
    updated_at: toNullableString(row?.updated_at),
    deleted_at: toNullableString(row?.deleted_at),
    price: toNullableNumber(row?.price),
    photo_url: toNullableString(row?.photo_url),
    photo_variants: row?.photo_variants ?? null,
    cover_image_id: toNullableString(row?.cover_image_id),
    has_unpublished_changes: row?.has_unpublished_changes === true,
    inventory_quantity: toNullableNumber(row?.inventory_quantity),
    inventory_status: toNullableString(row?.inventory_status),
    inventory_type: toNullableString(row?.inventory_type),
    low_stock_threshold: toNullableNumber(row?.low_stock_threshold),
    inventory_last_updated_at: toNullableString(row?.inventory_last_updated_at),
    is_internal: row?.is_internal === true,
    is_test: toNullableBoolean(row?.is_test),
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
  reason,
}: {
  listingId: string;
  hidden: boolean;
  actorUserId: string;
  reason: string;
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

  const updates = applySupportedListingUpdates(current, nowIso, {
    admin_hidden: hidden,
  });

  if (!("admin_hidden" in updates)) {
    throw new Error("Listing admin moderation visibility is not supported in this environment.");
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

  await logAdminAction(client, {
    action: hidden ? "listing_hidden" : "listing_unhidden",
    actorUserId,
    targetType: "listing",
    targetId: listingId,
    meta: {
      listing_id: listingId,
      public_id: updated.public_id || null,
      changed_at: nowIso,
      field: "visibility",
      previous_value: {
        hidden: computeListingStatus(current).status === "hidden",
        admin_hidden: current?.admin_hidden === true,
      },
      new_value: {
        admin_hidden: updated?.admin_hidden === true,
      },
      reason,
    },
  });

  const enriched = await enrichAdminListings(client, [updated]);
  return enriched[0] || null;
}

function normalizeAdminBusinessListingsPage(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function normalizeAdminBusinessListingsPageSize(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return ADMIN_BUSINESS_LISTINGS_PAGE_SIZE;
  return Math.min(MAX_ADMIN_BUSINESS_LISTINGS_PAGE_SIZE, Math.floor(parsed));
}

export async function listAdminBusinessListings(
  businessOwnerUserId: string,
  filters: AdminBusinessListingsFilters = {}
): Promise<AdminBusinessListingsResult> {
  const { client } = await getAdminDataClient({ mode: "service" });
  const page = normalizeAdminBusinessListingsPage(filters.page);
  const pageSize = normalizeAdminBusinessListingsPageSize(filters.pageSize);
  const rangeFrom = (page - 1) * pageSize;
  const rangeTo = rangeFrom + pageSize - 1;
  const search = sanitizeSearchTerm(String(filters.q || "").trim());

  let query = client
    .from("listings")
    .select("*", { count: "exact" })
    .eq("business_id", businessOwnerUserId)
    .order("created_at", { ascending: false });

  if (search) {
    query = query.or(`title.ilike.%${search}%,public_id.ilike.%${search}%`);
  }
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.visibility === "admin_hidden") {
    query = query.eq("admin_hidden", true);
  } else if (filters.visibility === "visible") {
    query = query.eq("admin_hidden", false);
  }
  if (filters.internal === "internal") {
    query = query.or("is_internal.is.true,is_test.is.true");
  } else if (filters.internal === "external") {
    query = query.not("is_internal", "is", true).not("is_test", "is", true);
  }
  if (filters.inventory === "out_of_stock") {
    query = query.or("inventory_quantity.eq.0,inventory_status.eq.out_of_stock");
  } else if (filters.inventory === "in_stock") {
    query = query.or("inventory_quantity.gt.0,inventory_status.eq.in_stock");
  }

  const { data, error, count } = await query.range(rangeFrom, rangeTo);

  if (error) {
    throw new Error(error.message || "Failed to load business listings.");
  }

  const rawRows = Array.isArray(data) ? data : [];
  const rows = rawRows.filter(
    (row) => toNullableString(row?.business_id) === businessOwnerUserId
  );
  const totalCount =
    rows.length !== rawRows.length && Number(count || 0) <= rawRows.length
      ? rows.length
      : Number(count || 0);

  return {
    rows: await enrichAdminListings(client, rows),
    totalCount,
    page,
    pageSize,
  };
}

function applySupportedListingUpdates(
  current: Record<string, any>,
  nowIso: string,
  partialUpdates: Record<string, unknown>
) {
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(partialUpdates)) {
    if (key in current) {
      updates[key] = value;
    }
  }
  if ("updated_at" in current) {
    updates.updated_at = nowIso;
  }
  return updates;
}

async function loadAdminListingForUpdate(listingId: string) {
  const { client } = await getAdminDataClient({ mode: "service" });
  const { data: current, error } = await client
    .from("listings")
    .select("*")
    .eq("id", listingId)
    .maybeSingle();

  if (error || !current?.id) {
    throw new Error("Listing not found.");
  }

  return { client, current };
}

export async function setAdminListingInternalState({
  listingId,
  internal,
  actorUserId,
  reason,
}: {
  listingId: string;
  internal: boolean;
  actorUserId: string;
  reason: string;
}) {
  const nowIso = new Date().toISOString();
  const { client, current } = await loadAdminListingForUpdate(listingId);
  const updates = applySupportedListingUpdates(current, nowIso, {
    is_internal: internal,
    is_test: internal,
  });

  if (!Object.keys(updates).some((key) => key === "is_internal" || key === "is_test")) {
    throw new Error("Listing internal/test state is not supported in this environment.");
  }

  const { data: updated, error } = await client
    .from("listings")
    .update(updates)
    .eq("id", listingId)
    .select("*")
    .maybeSingle();

  if (error || !updated?.id) {
    throw new Error(error?.message || "Failed to update listing internal/test state.");
  }

  await logAdminAction(client, {
    action: internal ? "listing_marked_internal" : "listing_unmarked_internal",
    actorUserId,
    targetType: "listing",
    targetId: listingId,
    meta: {
      listing_id: listingId,
      public_id: updated.public_id || null,
      changed_at: nowIso,
      field: "internal_test",
      previous_value: {
        is_internal: current?.is_internal ?? null,
        is_test: current?.is_test ?? null,
      },
      new_value: {
        is_internal: updated?.is_internal ?? null,
        is_test: updated?.is_test ?? null,
      },
      reason,
    },
  });

  const enriched = await enrichAdminListings(client, [updated]);
  return enriched[0] || null;
}
