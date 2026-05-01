import { NextResponse } from "next/server";
import { getSupabaseServerClient as getAuthedSupabaseServerClient } from "@/lib/supabaseServer";
import { getSupabaseServerClient as getServiceSupabaseServerClient } from "@/lib/supabase/server";
import { getInventoryAvailabilitySnapshot } from "@/lib/cart/reservations";

function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function getServiceClientOrFallback(fallbackClient) {
  try {
    return getServiceSupabaseServerClient() ?? fallbackClient;
  } catch {
    return fallbackClient;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const listingId = String(searchParams.get("listing_id") || "").trim();
  const variantId = String(searchParams.get("variant_id") || "").trim() || null;
  const excludeCartItemIds = [
    ...searchParams
      .getAll("exclude_cart_item_id")
      .map((value) => String(value || "").trim())
      .filter(Boolean),
    ...String(searchParams.get("exclude_cart_item_ids") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ];

  if (!listingId) {
    return jsonError("Missing listing_id", 400);
  }

  try {
    const supabase = await getAuthedSupabaseServerClient();
    const serviceClient = getServiceClientOrFallback(supabase);
    const snapshot = await getInventoryAvailabilitySnapshot({
      client: serviceClient,
      listingId,
      variantId,
      excludeCartItemIds,
    });

    return NextResponse.json(
      {
        stock_quantity: snapshot.stockQuantity,
        active_cart_reservations: snapshot.activeCartReservations,
        committed_order_quantity: snapshot.committedOrderQuantity,
        available_quantity: snapshot.availableQuantity,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    return jsonError(error?.message || "Failed to load availability", 500);
  }
}
