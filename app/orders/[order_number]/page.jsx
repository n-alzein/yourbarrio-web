import { requireRole } from "@/lib/auth/server";
import { getEntityIdSearchVariants } from "@/lib/entityIds";
import { formatOrderDateTime, formatOrderPurchaseDateTime } from "@/lib/orders";
import { isCustomerVisiblePaidOrder } from "@/lib/orders/customerVisibility";
import { reconcilePendingStripeOrders } from "@/lib/orders/persistence";
import { getSupabaseServerClient as getServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import OrderReceiptClient from "./OrderReceiptClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function buildOrderLookupClause(orderRef) {
  return getEntityIdSearchVariants("order", orderRef)
    .map((variant) => `order_number.ilike.${variant}`)
    .join(",");
}

function isTruthyParam(value) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;

  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export default async function OrderPage({ params, searchParams }) {
  const resolvedParams =
    params && typeof params.then === "function"
      ? await params
      : params;
  const resolvedSearchParams =
    searchParams && typeof searchParams.then === "function"
      ? await searchParams
      : searchParams;
  const orderNumber =
    typeof resolvedParams?.order_number === "string"
      ? resolvedParams.order_number.trim()
      : "";
  const checkoutSessionId =
    typeof resolvedSearchParams?.checkout_session_id === "string"
      ? resolvedSearchParams.checkout_session_id.trim()
      : "";
  const arrivedFromCheckout =
    checkoutSessionId.length > 0 ||
    resolvedSearchParams?.from === "checkout" ||
    isTruthyParam(resolvedSearchParams?.success);
  const { supabase, user } = await requireRole("customer");
  const userId = user?.id || "";

  if (!orderNumber) {
    return (
      <div className="min-h-screen px-4 md:px-8 lg:px-12 py-12" style={{ background: "var(--background)", color: "var(--text)" }}>
        <div className="max-w-3xl mx-auto rounded-3xl p-8" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h1 className="text-2xl font-semibold">Order not found</h1>
          <p className="mt-3 text-sm opacity-80">We couldn&apos;t find this order.</p>
        </div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="min-h-screen px-4 md:px-8 lg:px-12 py-12" style={{ background: "var(--background)", color: "var(--text)" }}>
        <div className="max-w-3xl mx-auto rounded-3xl p-8" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h1 className="text-2xl font-semibold">Order not available</h1>
          <p className="mt-3 text-sm opacity-80">Please log in to view this order.</p>
        </div>
      </div>
    );
  }

  let { data: order } = await supabase
    .from("orders")
    .select("*, order_items(*, listing:listings!order_items_listing_id_fkey(id))")
    .or(buildOrderLookupClause(orderNumber))
    .eq("user_id", userId)
    .maybeSingle();

  if (
    order?.id &&
    order?.status === "pending_payment" &&
    checkoutSessionId &&
    order?.stripe_checkout_session_id === checkoutSessionId
  ) {
    await reconcilePendingStripeOrders({
      client: getServiceClient() ?? supabase,
      userId,
      orderIds: [order.id],
      limit: 1,
      logPrefix: "[ORDER_FINALIZATION_TRACE]",
    });

    const { data: reconciledOrder } = await supabase
      .from("orders")
      .select("*, order_items(*, listing:listings!order_items_listing_id_fkey(id))")
      .eq("id", order.id)
      .eq("user_id", userId)
      .maybeSingle();

    order = reconciledOrder || order;
  }

  if (!order) {
    return (
      <div className="min-h-screen px-4 md:px-8 lg:px-12 py-12" style={{ background: "var(--background)", color: "var(--text)" }}>
        <div className="max-w-3xl mx-auto rounded-3xl p-8" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h1 className="text-2xl font-semibold">Order not found yet</h1>
          <p className="mt-3 text-sm opacity-80">We couldn&apos;t locate this order. Please refresh in a moment.</p>
        </div>
      </div>
    );
  }

  if (!isCustomerVisiblePaidOrder(order)) {
    notFound();
  }

  const { data: vendor } = await supabase
    .from("users")
    .select("id,business_name,full_name,city,address,profile_photo_url")
    .eq("id", order.vendor_id)
    .maybeSingle();

  return (
    <OrderReceiptClient
      order={order}
      vendor={vendor}
      purchasedAtLabel={formatOrderPurchaseDateTime(order)}
      statusTimestampLabel={formatOrderDateTime(order.updated_at || order.created_at)}
      mode={arrivedFromCheckout ? "checkout" : "details"}
    />
  );
}
