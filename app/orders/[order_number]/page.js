import { requireRole } from "@/lib/auth/server";
import { formatOrderDateTime } from "@/lib/orders";
import OrderReceiptClient from "./OrderReceiptClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OrderPage({ params }) {
  const resolvedParams =
    params && typeof params.then === "function"
      ? await params
      : params;
  const orderNumber =
    typeof resolvedParams?.order_number === "string"
      ? resolvedParams.order_number.trim()
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

  const { data: order } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .ilike("order_number", orderNumber)
    .eq("user_id", user.id)
    .maybeSingle();

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
