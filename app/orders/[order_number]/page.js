import { requireRole } from "@/lib/auth/server";
import { formatOrderDateTime } from "@/lib/orders";
import { reconcilePendingStripeOrders } from "@/lib/orders/persistence";
import { getSupabaseServerClient as getServiceClient } from "@/lib/supabase/server";
import OrderReceiptClient from "./OrderReceiptClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  const { supabase, user } = await requireRole("customer");

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

  let { data: order } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .ilike("order_number", orderNumber)
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    order?.id &&
    order?.status === "pending_payment" &&
    checkoutSessionId &&
    order?.stripe_checkout_session_id === checkoutSessionId
  ) {
    await reconcilePendingStripeOrders({
      client: getServiceClient() ?? supabase,
      userId: user.id,
      orderIds: [order.id],
      limit: 1,
      logPrefix: "[ORDER_FINALIZATION_TRACE]",
    });

    const { data: reconciledOrder } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", order.id)
      .eq("user_id", user.id)
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

  const { data: vendor } = await supabase
    .from("users")
    .select("id,business_name,full_name,city,address,profile_photo_url")
    .eq("id", order.vendor_id)
    .maybeSingle();

  return (
    <OrderReceiptClient
      order={order}
      vendor={vendor}
      purchasedAtLabel={formatOrderDateTime(order.created_at)}
    />
  );
}
