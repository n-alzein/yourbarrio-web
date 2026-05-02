import { CUSTOMER_HISTORY_ORDER_STATUSES } from "@/lib/orders/customerVisibility";

const DEFAULT_PURCHASE_HISTORY_LIMIT = 10;
const MAX_PURCHASE_HISTORY_LIMIT = 50;

const PURCHASE_HISTORY_SELECT =
  "id,order_number,created_at,paid_at,status,total, vendor:users!orders_vendor_id_fkey (business_name, full_name), order_items(id,image_url, listing:listings!order_items_listing_id_fkey(photo_url,photo_variants,cover_image_id))";

export function parsePurchaseHistoryPagination(params = {}) {
  const rawPage = Number(params.page || 1);
  const rawLimit = Number(params.limit || DEFAULT_PURCHASE_HISTORY_LIMIT);
  const page = Number.isFinite(rawPage) ? Math.max(Math.floor(rawPage), 1) : 1;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.floor(rawLimit), 1), MAX_PURCHASE_HISTORY_LIMIT)
    : DEFAULT_PURCHASE_HISTORY_LIMIT;

  return { page, limit };
}

export async function fetchPurchaseHistoryOrders({
  client,
  userId,
  page = 1,
  limit = DEFAULT_PURCHASE_HISTORY_LIMIT,
}) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await client
    .from("orders")
    .select(PURCHASE_HISTORY_SELECT, { count: "exact" })
    .eq("user_id", userId)
    .in("status", CUSTOMER_HISTORY_ORDER_STATUSES)
    .not("paid_at", "is", null)
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (error) {
    return {
      orders: [],
      total_count: 0,
      total_pages: 0,
      error,
    };
  }

  const totalCount = Number(count || 0);

  return {
    orders: data || [],
    total_count: totalCount,
    total_pages: totalCount > 0 ? Math.ceil(totalCount / limit) : 0,
    error: null,
  };
}

export { DEFAULT_PURCHASE_HISTORY_LIMIT };
