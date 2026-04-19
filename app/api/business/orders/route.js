import { NextResponse } from "next/server";
import { getSupabaseServerClient as getSupabaseServiceClient } from "@/lib/supabase/server";
import { getBusinessDataClientForRequest } from "@/lib/business/getBusinessDataClientForRequest";
import {
  markOrderAcknowledged,
  markOrderAcknowledgedForStatusChange,
} from "@/lib/notifications/orders";
import { reconcilePendingStripeOrders } from "@/lib/orders/persistence";
import {
  reserveInventoryForOrderItems,
  restoreInventoryReservations,
  restoreInventoryForOrder,
} from "@/lib/orders/inventoryReservations";
import {
  ORDER_STATUSES,
  canTransition,
  isBackward,
} from "@/lib/orders/statusTransitions";

const STATUS_TABS = {
  new: ["requested"],
  progress: ["confirmed", "ready", "out_for_delivery"],
  completed: ["fulfilled"],
  cancelled: ["payment_failed", "cancelled"],
};

const STATUS_LABELS = {
  pending_payment: "Pending payment",
  payment_failed: "Payment failed",
  requested: "Requested",
  confirmed: "Confirmed",
  ready: "Ready for pickup",
  out_for_delivery: "Out for delivery",
  fulfilled: "Fulfilled",
  completed: "Completed",
  cancelled: "Cancelled",
};

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

async function getOrCreateConversationId(client, customerId, businessId) {
  if (!client || !customerId || !businessId) return null;

  const { data, error } = await client.rpc("get_or_create_conversation", {
    customer_id: customerId,
    business_id: businessId,
  });

  if (!error && data) return data;

  const message = (error?.message || "").toLowerCase();
  const missingRpc =
    error?.code === "PGRST202" ||
    message.includes("could not find the function") ||
    message.includes("function public.get_or_create_conversation");

  if (!missingRpc) throw error;

  const { data: existing, error: existingError } = await client
    .from("conversations")
    .select("id")
    .eq("customer_id", customerId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) return existing.id;

  const { data: upserted, error: upsertError } = await client
    .from("conversations")
    .upsert(
      { customer_id: customerId, business_id: businessId },
      { onConflict: "customer_id,business_id" }
    )
    .select("id")
    .single();

  if (upsertError) throw upsertError;
  return upserted?.id || null;
}

export async function GET(request) {
  const access = await getBusinessDataClientForRequest();
  if (!access.ok) {
    return jsonError(access.error, access.status);
  }
  const diagEnabled = process.env.NODE_ENV !== "production";
  const supabase = access.client;
  const serviceClient = getSupabaseServiceClient();
  const effectiveUserId = access.effectiveUserId;
  const businessId = access.businessId || null;

  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab") || "new";
  const statusList = STATUS_TABS[tab] || STATUS_TABS.new;

  if (tab === "new") {
    await reconcilePendingStripeOrders({
      client: serviceClient ?? supabase,
      vendorId: effectiveUserId,
      limit: 50,
      logPrefix: "[ORDER_FINALIZATION_TRACE]",
    });
  }

  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("vendor_id", effectiveUserId)
    .in("status", statusList)
    .order("created_at", { ascending: false });

  if (error) {
    if (diagEnabled) {
      console.warn("[BUSINESS_ORDERS_TRACE]", "read_failed", {
        effectiveUserId,
        businessId,
        tab,
        statusList,
        code: error.code || null,
        message: error.message || null,
      });
    }
    return jsonError(error.message || "Failed to load orders", 500);
  }

  if (diagEnabled) {
    console.warn("[BUSINESS_ORDERS_TRACE]", "read", {
      effectiveUserId,
      businessId,
      tab,
      statusList,
      rowCount: Array.isArray(data) ? data.length : 0,
    });
  }

  return NextResponse.json({ orders: data || [] }, { status: 200 });
}

export async function POST(request) {
  const access = await getBusinessDataClientForRequest();
  if (!access.ok) {
    return jsonError(access.error, access.status);
  }

  const supabase = access.client;
  const effectiveUserId = access.effectiveUserId;
  const actorUserId = access.actorUserId || access.effectiveUserId;
  const serviceClient = getSupabaseServiceClient();

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const orderId = body?.order_id;
  if (!orderId) {
    return jsonError("Missing order_id", 400);
  }

  const { data: existingOrder, error: existingOrderError } = await supabase
    .from("orders")
    .select("id,vendor_id,acknowledged_at,acknowledged_by,notification_state")
    .eq("id", orderId)
    .eq("vendor_id", effectiveUserId)
    .maybeSingle();

  if (existingOrderError) {
    return jsonError(existingOrderError.message || "Failed to load order", 500);
  }

  if (!existingOrder?.id) {
    return jsonError("Order not found", 404);
  }

  try {
    const acknowledged = await markOrderAcknowledged(orderId, actorUserId, {
      client: serviceClient ?? supabase,
    });

    return NextResponse.json(
      {
        order: {
          id: existingOrder.id,
          acknowledged_at:
            acknowledged?.acknowledged_at || existingOrder.acknowledged_at || null,
          acknowledged_by:
            acknowledged?.acknowledged_by || existingOrder.acknowledged_by || null,
          notification_state:
            acknowledged?.notification_state ||
            existingOrder.notification_state ||
            null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return jsonError(error?.message || "Failed to acknowledge order", 500);
  }
}

export async function PATCH(request) {
  const access = await getBusinessDataClientForRequest();
  if (!access.ok) {
    return jsonError(access.error, access.status);
  }
  const supabase = access.client;
  const effectiveUserId = access.effectiveUserId;
  const actorUserId = access.actorUserId || access.effectiveUserId;
  const serviceClient = getSupabaseServiceClient();

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const orderId = body?.order_id;
  const nextStatus = body?.status;
  const reasonRaw = body?.reason;
  const reason = typeof reasonRaw === "string" ? reasonRaw.trim() : "";

  if (!orderId || !nextStatus) {
    return jsonError("Missing order_id or status", 400);
  }

  const { data: existingOrder, error: existingOrderError } = await supabase
    .from("orders")
    .select(
      "id, status, vendor_id, fulfillment_type, confirmed_at, fulfilled_at, cancelled_at, inventory_reserved_at, inventory_restored_at"
    )
    .eq("id", orderId)
    .eq("vendor_id", effectiveUserId)
    .maybeSingle();

  if (existingOrderError) {
    return jsonError(existingOrderError.message || "Failed to load order", 500);
  }

  if (!existingOrder) {
    return jsonError("Order not found", 404);
  }

  if (!ORDER_STATUSES.includes(nextStatus)) {
    return jsonError("Invalid status", 400);
  }

  const currentStatus = existingOrder.status;
  if (currentStatus === "fulfilled") {
    return jsonError("Invalid status transition", 400);
  }

  const isBackwardTransition = isBackward(currentStatus, nextStatus);
  const isReopenTransition = currentStatus === "cancelled";

  const transitionAllowed = canTransition({
    from: currentStatus,
    to: nextStatus,
    fulfillmentType: existingOrder.fulfillment_type,
  });
  if (!transitionAllowed) {
    return jsonError("Invalid status transition", 400);
  }

  const needsReason = isBackwardTransition || isReopenTransition;
  if (needsReason && reason.length < 5) {
    return jsonError("Reason required", 400);
  }

  const shouldAdjustInventory =
    currentStatus === "requested" && nextStatus === "confirmed" && !existingOrder.inventory_reserved_at;
  const shouldRestoreInventory =
    nextStatus === "cancelled" &&
    existingOrder.inventory_reserved_at &&
    !existingOrder.inventory_restored_at;
  let orderItems = [];

  if (shouldAdjustInventory || shouldRestoreInventory) {
    const { data: items, error: itemsError } = await supabase
      .from("order_items")
      .select("id, listing_id, quantity")
      .eq("order_id", orderId);

    if (itemsError) {
      return jsonError(itemsError.message || "Failed to load order items", 500);
    }

    orderItems = items || [];
  }

  const timestamp = new Date().toISOString();
  const updates = {
    status: nextStatus,
    updated_at: timestamp,
  };

  if (nextStatus !== "cancelled") updates.cancelled_at = null;
  if (nextStatus === "confirmed") updates.confirmed_at = timestamp;
  if (nextStatus === "fulfilled") updates.fulfilled_at = timestamp;
  if (nextStatus === "cancelled") updates.cancelled_at = timestamp;

  const { data, error } = await supabase
    .from("orders")
    .update(updates)
    .eq("id", orderId)
    .select(
      "id,order_number,user_id,status,updated_at,confirmed_at,fulfilled_at,cancelled_at,acknowledged_at,acknowledged_by,notification_state"
    )
    .maybeSingle();

  if (error) {
    return jsonError(error.message || "Failed to update order", 500);
  }

  const auditClient = serviceClient ?? supabase;
  const { error: eventError } = await auditClient
    .from("order_status_events")
    .insert({
      order_id: orderId,
      vendor_id: effectiveUserId,
      actor_user_id: actorUserId,
      actor_role: "business",
      from_status: currentStatus,
      to_status: nextStatus,
      reason: reason || null,
      created_at: timestamp,
    });

  if (eventError) {
    return jsonError(eventError.message || "Failed to write status audit", 500);
  }

  if (shouldAdjustInventory) {
    const inventoryClient = serviceClient ?? supabase;
    let reservations = [];
    try {
      reservations = await reserveInventoryForOrderItems({
        client: inventoryClient,
        items: orderItems,
      });
      for (const reservation of reservations) {
        const orderItem = orderItems.find((item) => item.listing_id === reservation.listing_id);
        if (!orderItem?.id) {
          throw new Error("Reserved order item could not be linked.");
        }
        const { data: attachResult, error: attachError } = await inventoryClient.rpc(
          "attach_inventory_reservation_to_order_item",
          {
            p_reservation_id: reservation.inventory_reservation_id,
            p_order_id: orderId,
            p_order_item_id: orderItem.id,
          }
        );
        const normalizedAttach = Array.isArray(attachResult) ? attachResult[0] : attachResult;
        if (attachError || !normalizedAttach?.success) {
          throw new Error(
            attachError?.message ||
              normalizedAttach?.message ||
              "Failed to link inventory reservation"
          );
        }
      }
      await supabase
        .from("orders")
        .update({
          inventory_reserved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .eq("vendor_id", effectiveUserId)
        .is("inventory_reserved_at", null);
    } catch (inventoryError) {
      if (reservations.length > 0) {
        try {
          await restoreInventoryReservations({
            client: inventoryClient,
            reservations,
            allowUnlinked: true,
          });
        } catch (restoreError) {
          console.error("[BUSINESS_ORDER_TRACE]", "inventory_restore_failed", {
            orderId,
            message: restoreError?.message || null,
          });
        }
      }
      await supabase
        .from("orders")
        .update({
          status: existingOrder.status,
          confirmed_at: existingOrder.confirmed_at,
          fulfilled_at: existingOrder.fulfilled_at,
          cancelled_at: existingOrder.cancelled_at,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .eq("vendor_id", effectiveUserId);

      return jsonError(
        inventoryError?.message || "Failed to update inventory",
        500
      );
    }
  }

  if (shouldRestoreInventory) {
    const inventoryClient = serviceClient ?? supabase;
    try {
      await restoreInventoryForOrder({
        client: inventoryClient,
        orderId,
      });
      await supabase
        .from("orders")
        .update({
          inventory_restored_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .eq("vendor_id", effectiveUserId)
        .is("inventory_restored_at", null);
    } catch (inventoryError) {
      await supabase
        .from("orders")
        .update({
          status: existingOrder.status,
          confirmed_at: existingOrder.confirmed_at,
          fulfilled_at: existingOrder.fulfilled_at,
          cancelled_at: existingOrder.cancelled_at,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .eq("vendor_id", effectiveUserId);

      return jsonError(
        inventoryError?.message || "Failed to restore inventory",
        500
      );
    }
  }

  if (data?.user_id) {
    const statusLabel = STATUS_LABELS[data.status] || data.status;
    const notificationClient = serviceClient ?? supabase;
    const { error: notificationError } = await notificationClient
      .from("notifications")
      .insert({
        recipient_user_id: data.user_id,
        vendor_id: effectiveUserId,
        order_id: data.id,
        type: "order_status",
        title: `Order ${data.order_number} update`,
        body: `Your order status is now ${statusLabel}.`,
      });
    if (notificationError) {
      return jsonError(
        notificationError.message || "Failed to send notification",
        500
      );
    }

    const conversationId = await getOrCreateConversationId(
      notificationClient,
      data.user_id,
      effectiveUserId
    );
    if (!conversationId) {
      return jsonError("Failed to start conversation", 500);
    }

    const { error: messageError } = await notificationClient
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: effectiveUserId,
        recipient_id: data.user_id,
        body: `Order ${data.order_number} update: Your order status is now ${statusLabel}.`,
      });
    if (messageError) {
      return jsonError(
        messageError.message || "Failed to send message",
        500
      );
    }
  }

  let acknowledgmentUpdate = null;
  try {
    acknowledgmentUpdate = await markOrderAcknowledgedForStatusChange({
      orderId,
      actorUserId,
      nextStatus,
      client: serviceClient ?? supabase,
    });
  } catch (ackError) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[BUSINESS_ORDERS_TRACE]", "acknowledge_on_status_change_failed", {
        orderId,
        actorUserId,
        nextStatus,
        message: ackError?.message || null,
      });
    }
  }

  return NextResponse.json(
    {
      order: acknowledgmentUpdate
        ? {
            ...data,
            acknowledged_at:
              acknowledgmentUpdate.acknowledged_at || data?.acknowledged_at || null,
            acknowledged_by:
              acknowledgmentUpdate.acknowledged_by || data?.acknowledged_by || null,
            notification_state:
              acknowledgmentUpdate.notification_state ||
              data?.notification_state ||
              null,
          }
        : data,
    },
    { status: 200 }
  );
}
