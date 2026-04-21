import { NextResponse } from "next/server";
import { getBusinessByUserId } from "@/lib/business/getBusinessByUserId";
import { getBusinessDataClientForRequest } from "@/lib/business/getBusinessDataClientForRequest";
import { resolveAvatarUrl } from "@/lib/avatarUrl";
import { reconcilePendingStripeOrders } from "@/lib/orders/persistence";
import { getSupabaseServerClient as getSupabaseServiceClient } from "@/lib/supabase/server";
import { getListingCategoryLabel } from "@/lib/taxonomy/compat";

const SALES_STATUSES = ["fulfilled", "completed"];
const ORDER_COUNT_STATUSES = [
  "pending_payment",
  "requested",
  "confirmed",
  "ready",
  "out_for_delivery",
  "fulfilled",
  "completed",
];
const BUSINESS_VISIBLE_STATUSES = [
  "pending_payment",
  "payment_failed",
  "requested",
  "confirmed",
  "ready",
  "out_for_delivery",
  "fulfilled",
  "completed",
  "cancelled",
];

const parseDate = (value, fallback) => {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
};

const formatDate = (date) => date.toISOString().slice(0, 10);

const buildDateRange = (fromParam, toParam) => {
  const today = new Date();
  const fallbackFrom = new Date();
  fallbackFrom.setDate(today.getDate() - 29);
  const from = parseDate(fromParam, fallbackFrom);
  const to = parseDate(toParam, today);
  const start = new Date(from);
  const end = new Date(to);
  return { from: start, to: end };
};

const getCompareRange = (from, to, mode) => {
  if (mode === "none") return null;
  const start = new Date(from);
  const end = new Date(to);
  if (mode === "yoy") {
    start.setFullYear(start.getFullYear() - 1);
    end.setFullYear(end.getFullYear() - 1);
    return { from: start, to: end, offsetDays: 365 };
  }
  const diffDays = Math.round((to - from) / (1000 * 60 * 60 * 24)) + 1;
  const compareTo = new Date(from);
  compareTo.setDate(compareTo.getDate() - 1);
  const compareFrom = new Date(compareTo);
  compareFrom.setDate(compareFrom.getDate() - (diffDays - 1));
  return { from: compareFrom, to: compareTo, offsetDays: diffDays };
};

const buildDateBuckets = (from, to) => {
  const buckets = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    buckets.push(formatDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return buckets;
};

const aggregateByDate = (rows, accessor) => {
  const map = new Map();
  rows.forEach((row) => {
    const key = formatDate(new Date(row.created_at));
    map.set(key, (map.get(key) || 0) + accessor(row));
  });
  return map;
};

const mapOrderStatus = (status) => {
  if (status === "fulfilled" || status === "completed") return "fulfilled";
  if (status === "payment_failed") return "refunded";
  if (status === "cancelled") return "refunded";
  if (["confirmed", "ready", "out_for_delivery"].includes(status)) return "on_hold";
  return "pending";
};

const mapOrderTab = (status) => {
  if (status === "pending_payment" || status === "requested") return "new";
  if (["confirmed", "ready", "out_for_delivery"].includes(status)) return "progress";
  if (status === "payment_failed") return "cancelled";
  if (status === "cancelled") return "cancelled";
  return "completed";
};

const buildScopedIds = (...values) =>
  Array.from(
    new Set(
      values
        .flat()
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

const applyScopedIdFilter = (query, field, scopedIds) => {
  if (!Array.isArray(scopedIds) || scopedIds.length === 0) return query;
  if (scopedIds.length === 1) return query.eq(field, scopedIds[0]);
  return query.in(field, scopedIds);
};

const asTrimmedString = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

export async function GET(request) {
  const access = await getBusinessDataClientForRequest();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const diagEnabled = process.env.NODE_ENV !== "production";
  const supabase = access.client;
  const serviceClient = getSupabaseServiceClient();
  const businessUserId = access.effectiveUserId;
  const businessId = access.businessId || null;
  const vendorScopedIds = buildScopedIds(businessId, businessUserId);
  const businessScopedIds = buildScopedIds(businessId, businessUserId);

  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const compare = searchParams.get("compare") || "previous";
  const categoriesFilter = (searchParams.get("categories") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const { from, to } = buildDateRange(fromParam, toParam);
  const compareRange = getCompareRange(from, to, compare);
  const dateKeys = buildDateBuckets(
    new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())),
    new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()))
  );
  const fromStr = from.toISOString();
  const toStr = to.toISOString();

  await Promise.all(
    vendorScopedIds.map((vendorScopedId) =>
      reconcilePendingStripeOrders({
        client: serviceClient ?? supabase,
        vendorId: vendorScopedId,
        limit: 50,
        logPrefix: "[ORDER_FINALIZATION_TRACE]",
      })
    )
  );

  const [ordersRes, orderCountRes, viewsRes, listingsRes, recentOrdersRes, businessProfile] =
    await Promise.all([
      applyScopedIdFilter(
        supabase
        .from("orders")
        .select("id, order_number, created_at, total, status, contact_name, user_id")
        .in("status", SALES_STATUSES)
        .gte("created_at", fromStr)
        .lte("created_at", toStr),
        "vendor_id",
        vendorScopedIds
      ),
      applyScopedIdFilter(
        supabase
        .from("orders")
        .select("id")
        .in("status", ORDER_COUNT_STATUSES)
        .gte("created_at", fromStr)
        .lte("created_at", toStr),
        "vendor_id",
        vendorScopedIds
      ),
      applyScopedIdFilter(
        supabase
        .from("business_views")
        .select("viewed_at")
        .gte("viewed_at", fromStr)
        .lte("viewed_at", toStr),
        "business_id",
        businessScopedIds
      ),
      applyScopedIdFilter(
        supabase
        .from("listings")
        .select(
          "id, title, category, listing_category, inventory_quantity"
        )
        ,
        "business_id",
        businessScopedIds
      ),
      applyScopedIdFilter(
        supabase
        .from("orders")
        .select("id, order_number, created_at, total, status, contact_name, user_id")
        .in("status", BUSINESS_VISIBLE_STATUSES)
        .order("created_at", { ascending: false })
        .limit(8),
        "vendor_id",
        vendorScopedIds
      ),
      getBusinessByUserId({
        client: supabase,
        userId: businessUserId,
      }),
    ]);

  if (ordersRes.error) {
    return NextResponse.json(
      { error: ordersRes.error.message || "Failed to load orders" },
      { status: 500 }
    );
  }
  if (viewsRes.error) {
    return NextResponse.json(
      { error: viewsRes.error.message || "Failed to load views" },
      { status: 500 }
    );
  }
  if (orderCountRes.error) {
    return NextResponse.json(
      { error: orderCountRes.error.message || "Failed to load order count" },
      { status: 500 }
    );
  }
  if (listingsRes.error) {
    return NextResponse.json(
      { error: listingsRes.error.message || "Failed to load listings" },
      { status: 500 }
    );
  }
  if (recentOrdersRes.error) {
    return NextResponse.json(
      { error: recentOrdersRes.error.message || "Failed to load recent orders" },
      { status: 500 }
    );
  }

  if (diagEnabled) {
    console.warn("[BUSINESS_ORDERS_TRACE]", "dashboard_read", {
      effectiveUserId: businessUserId,
      businessId,
      vendorScopedIds,
      businessScopedIds,
      ordersCount: Array.isArray(ordersRes.data) ? ordersRes.data.length : 0,
      orderCount: Array.isArray(orderCountRes.data) ? orderCountRes.data.length : 0,
      viewsCount: Array.isArray(viewsRes.data) ? viewsRes.data.length : 0,
      listingsCount: Array.isArray(listingsRes.data) ? listingsRes.data.length : 0,
      recentOrdersCount: Array.isArray(recentOrdersRes.data) ? recentOrdersRes.data.length : 0,
    });
  }

  const listingRows = listingsRes.data || [];
  const listingMap = new Map(
    listingRows.map((row) => [
      row.id,
      {
        title: row.title,
        category: getListingCategoryLabel(row, "Uncategorized"),
        inventoryQty: row.inventory_quantity ?? null,
      },
    ])
  );
  const categories = Array.from(
    new Set(
      listingRows
        .map((row) => getListingCategoryLabel(row, ""))
        .filter(Boolean)
    )
  );

  const orders = ordersRes.data || [];
  const salesMap = aggregateByDate(orders, (row) => Number(row.total || 0));
  const salesTimeSeries = dateKeys.map((date) => ({
    date,
    value: salesMap.get(date) || 0,
  }));

  const views = viewsRes.data || [];
  const viewsMap = aggregateByDate(
    views.map((row) => ({ created_at: row.viewed_at })),
    () => 1
  );
  const profileViewsTimeSeries = dateKeys.map((date) => ({
    date,
    value: viewsMap.get(date) || 0,
  }));

  if (compareRange) {
    const compareFromStr = compareRange.from.toISOString();
    const compareToStr = compareRange.to.toISOString();

    const [compareOrdersRes, compareViewsRes] = await Promise.all([
      applyScopedIdFilter(
        supabase
        .from("orders")
        .select("created_at, total")
        .in("status", SALES_STATUSES)
        .gte("created_at", compareFromStr)
        .lte("created_at", compareToStr),
        "vendor_id",
        vendorScopedIds
      ),
      applyScopedIdFilter(
        supabase
        .from("business_views")
        .select("viewed_at")
        .gte("viewed_at", compareFromStr)
        .lte("viewed_at", compareToStr),
        "business_id",
        businessScopedIds
      ),
    ]);

    if (compareOrdersRes.error) {
      return NextResponse.json(
        { error: compareOrdersRes.error.message || "Failed to load compare orders" },
        { status: 500 }
      );
    }
    if (compareViewsRes.error) {
      return NextResponse.json(
        { error: compareViewsRes.error.message || "Failed to load compare views" },
        { status: 500 }
      );
    }

    const compareSalesMap = aggregateByDate(compareOrdersRes.data || [], (row) =>
      Number(row.total || 0)
    );
    const compareViewsMap = aggregateByDate(
      (compareViewsRes.data || []).map((row) => ({ created_at: row.viewed_at })),
      () => 1
    );

    salesTimeSeries.forEach((point) => {
      const baseDate = new Date(point.date);
      if (compare === "yoy") {
        baseDate.setFullYear(baseDate.getFullYear() - 1);
      } else {
        baseDate.setDate(baseDate.getDate() - compareRange.offsetDays);
      }
      point.compareValue = compareSalesMap.get(formatDate(baseDate)) || 0;
    });

    profileViewsTimeSeries.forEach((point) => {
      const baseDate = new Date(point.date);
      if (compare === "yoy") {
        baseDate.setFullYear(baseDate.getFullYear() - 1);
      } else {
        baseDate.setDate(baseDate.getDate() - compareRange.offsetDays);
      }
      point.compareValue = compareViewsMap.get(formatDate(baseDate)) || 0;
    });
  }

  const orderIds = orders.map((order) => order.id);
  let orderItems = [];
  if (orderIds.length > 0) {
    const { data: itemRows, error: itemError } = await supabase
      .from("order_items")
      .select("order_id, listing_id, title, quantity, unit_price")
      .in("order_id", orderIds);
    if (itemError) {
      return NextResponse.json(
        { error: itemError.message || "Failed to load order items" },
        { status: 500 }
      );
    }
    orderItems = itemRows || [];
  }

  const productsMap = new Map();
  const ordersByProduct = new Map();
  orderItems.forEach((item) => {
    const listing = listingMap.get(item.listing_id);
    const category = getListingCategoryLabel(listing, "Uncategorized");
    if (categoriesFilter.length > 0 && !categoriesFilter.includes(category)) {
      return;
    }
    const productId = item.listing_id || item.title;
    const name = listing?.title || item.title || "Untitled";
    const key = productId || name;
    const revenue = Number(item.unit_price || 0) * Number(item.quantity || 0);
    if (!productsMap.has(key)) {
      productsMap.set(key, {
        id: String(key),
        name,
        category,
        revenue: 0,
        orders: 0,
        inventoryQty: listing?.inventoryQty ?? null,
      });
    }
    const entry = productsMap.get(key);
    entry.revenue += revenue;
    const orderSet = ordersByProduct.get(key) || new Set();
    orderSet.add(item.order_id);
    ordersByProduct.set(key, orderSet);
  });

  const topProducts = Array.from(productsMap.values())
    .map((entry) => ({
      ...entry,
      orders: ordersByProduct.get(entry.id)?.size || 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  const recentOrdersRaw = recentOrdersRes.data || [];
  const customerIds = recentOrdersRaw
    .map((order) => order.user_id)
    .filter(Boolean);
  let customersById = new Map();
  if (customerIds.length > 0) {
    const { data: customerRows, error: customerError } = await supabase
      .from("users")
      .select("id, full_name, business_name")
      .in("id", customerIds);
    if (customerError) {
      return NextResponse.json(
        { error: customerError.message || "Failed to load customers" },
        { status: 500 }
      );
    }
    customersById = new Map(
      (customerRows || []).map((row) => [
        row.id,
        row.business_name || row.full_name || "Customer",
      ])
    );
  }
  const recentOrderIds = recentOrdersRaw.map((order) => order.id);
  let recentItems = [];
  if (recentOrderIds.length > 0) {
    const { data: recentItemRows, error: recentItemError } = await supabase
      .from("order_items")
      .select("order_id, listing_id, quantity")
      .in("order_id", recentOrderIds);
    if (recentItemError) {
      return NextResponse.json(
        { error: recentItemError.message || "Failed to load recent order items" },
        { status: 500 }
      );
    }
    recentItems = recentItemRows || [];
  }

  const itemsByOrder = new Map();
  recentItems.forEach((item) => {
    const listing = listingMap.get(item.listing_id);
    const category = getListingCategoryLabel(listing, "Uncategorized");
    if (categoriesFilter.length > 0 && !categoriesFilter.includes(category)) {
      return;
    }
    const current = itemsByOrder.get(item.order_id) || 0;
    itemsByOrder.set(item.order_id, current + Number(item.quantity || 0));
  });

  const recentOrders = recentOrdersRaw
    .filter((order) => {
      if (categoriesFilter.length === 0) return true;
      return itemsByOrder.has(order.id);
    })
    .map((order) => ({
      id: order.order_number,
      customerName:
        order.contact_name ||
        customersById.get(order.user_id) ||
        "Customer",
      total: Number(order.total || 0),
      status: mapOrderStatus(order.status),
      date: order.created_at,
      items: itemsByOrder.get(order.id) || 0,
      href: `/business/orders?tab=${mapOrderTab(order.status)}&order=${order.order_number}`,
    }))
    .slice(0, 5);

  const response = NextResponse.json(
    {
      lastUpdated: new Date().toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
      salesTimeSeries,
      profileViewsTimeSeries,
      topProducts,
      recentOrders,
      categories,
      listingCount: listingRows.length,
      orderCount: (orderCountRes.data || []).length,
      viewCount: views.length,
      businessName:
        access.effectiveProfile?.business_name ||
        access.effectiveProfile?.full_name ||
        businessProfile?.business_name ||
        businessProfile?.full_name ||
        "YourBarrio",
      businessAvatarUrl:
        resolveAvatarUrl(
          asTrimmedString(access.effectiveProfile?.profile_photo_url),
          asTrimmedString(businessProfile?.profile_photo_url),
          access.authUserMetadata
        ),
    },
    { status: 200 }
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
