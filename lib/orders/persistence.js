import "server-only";

import { createHash } from "node:crypto";

import { buildOrderNumber } from "@/lib/orders/orderNumber";
import {
  resolvePaidOrderStatus,
  resolvePaymentFailedStatus,
  shouldWritePaidTimestamp,
} from "@/lib/orders/marketplace";
import { centsToDollars, getStripe } from "@/lib/stripe";
import { getSupabaseServerClient as getSupabaseServiceClient } from "@/lib/supabase/server";

function logTrace(prefix, event, payload) {
  if (process.env.NODE_ENV === "production") return;
  console.warn(prefix, event, payload);
}

function getPrivilegedClient(client) {
  try {
    return getSupabaseServiceClient() ?? client;
  } catch {
    return client;
  }
}

function buildDeterministicNotificationId({ recipientUserId, orderId, type }) {
  const digest = createHash("md5")
    .update(`${type}:${orderId}:${recipientUserId}`)
    .digest("hex");

  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    digest.slice(12, 16),
    digest.slice(16, 20),
    digest.slice(20, 32),
  ].join("-");
}

function isMissingRelationError(error, relationName) {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST204" ||
    (Boolean(relationName) && message.includes(String(relationName).toLowerCase()) && message.includes("does not exist"))
  );
}

async function ensureOwnerVendorMembership({ client, vendorId, logPrefix }) {
  if (!client || !vendorId) return;

  const { error } = await client.from("vendor_members").insert({
    vendor_id: vendorId,
    user_id: vendorId,
    role: "owner",
  });

  if (!error || error.code === "23505" || isMissingRelationError(error, "vendor_members")) {
    return;
  }

  logTrace(logPrefix, "ensure_vendor_membership_failed", {
    vendorId,
    code: error.code || null,
    message: error.message || null,
  });
  throw new Error(error.message || "Failed to ensure vendor membership");
}

async function listVendorNotificationRecipients({ client, vendorId, logPrefix }) {
  if (!client || !vendorId) return [];

  const { data, error } = await client
    .from("vendor_members")
    .select("user_id")
    .eq("vendor_id", vendorId);

  if (error) {
    if (isMissingRelationError(error, "vendor_members")) {
      return [vendorId];
    }
    logTrace(logPrefix, "load_vendor_notification_recipients_failed", {
      vendorId,
      code: error.code || null,
      message: error.message || null,
    });
    throw new Error(error.message || "Failed to load vendor notification recipients");
  }

  const recipients = Array.isArray(data)
    ? data.map((row) => row?.user_id).filter(Boolean)
    : [];

  return recipients.length > 0 ? recipients : [vendorId];
}

export async function maybeCreateOrderRequestedNotifications({
  client,
  order,
  logPrefix = "[ORDER_FINALIZATION_TRACE]",
}) {
  if (!client || !order?.id || !order?.vendor_id || !order?.order_number) {
    return { created: 0, recipients: 0 };
  }

  const notificationClient = getPrivilegedClient(client);

  await ensureOwnerVendorMembership({
    client: notificationClient,
    vendorId: order.vendor_id,
    logPrefix,
  });

  const recipientIds = await listVendorNotificationRecipients({
    client: notificationClient,
    vendorId: order.vendor_id,
    logPrefix,
  });

  if (recipientIds.length === 0) {
    return { created: 0, recipients: 0 };
  }

  const { data: existing, error: existingError } = await notificationClient
    .from("notifications")
    .select("recipient_user_id")
    .eq("order_id", order.id)
    .eq("type", "order_requested")
    .in("recipient_user_id", recipientIds);

  if (existingError) {
    logTrace(logPrefix, "load_existing_order_notifications_failed", {
      orderId: order.id,
      vendorId: order.vendor_id,
      code: existingError.code || null,
      message: existingError.message || null,
    });
    throw new Error(existingError.message || "Failed to load order notifications");
  }

  const existingRecipientIds = new Set(
    Array.isArray(existing) ? existing.map((row) => row?.recipient_user_id).filter(Boolean) : []
  );

  const rows = recipientIds
    .filter((recipientUserId) => !existingRecipientIds.has(recipientUserId))
    .map((recipientUserId) => ({
      id: buildDeterministicNotificationId({
        recipientUserId,
        orderId: order.id,
        type: "order_requested",
      }),
      recipient_user_id: recipientUserId,
      vendor_id: order.vendor_id,
      order_id: order.id,
      type: "order_requested",
      title: `New order request: ${order.order_number}`,
      body: null,
    }));

  if (rows.length === 0) {
    return { created: 0, recipients: recipientIds.length };
  }

  const { error: insertError } = await notificationClient.from("notifications").insert(rows);
  if (insertError && insertError.code !== "23505") {
    logTrace(logPrefix, "create_order_notifications_failed", {
      orderId: order.id,
      vendorId: order.vendor_id,
      code: insertError.code || null,
      message: insertError.message || null,
      recipients: rows.map((row) => row.recipient_user_id),
    });
    throw new Error(insertError.message || "Failed to create order notifications");
  }

  if (!insertError) {
    logTrace(logPrefix, "create_order_notifications_success", {
      orderId: order.id,
      orderNumber: order.order_number,
      vendorId: order.vendor_id,
      recipients: rows.map((row) => row.recipient_user_id),
    });
  }

  return {
    created: insertError?.code === "23505" ? 0 : rows.length,
    recipients: recipientIds.length,
  };
}

export async function createOrderWithItems({
  client,
  order,
  items,
  logPrefix = "[ORDER_FINALIZATION_TRACE]",
}) {
  let lastError = null;
  let orderRecord = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const orderNumber = buildOrderNumber();
    const { data, error } = await client
      .from("orders")
      .insert({
        ...order,
        order_number: orderNumber,
      })
      .select("id,order_number,status,vendor_id,user_id")
      .single();

    if (!error) {
      orderRecord = data;
      break;
    }

    if (error?.code !== "23505") {
      lastError = error;
      break;
    }
  }

  if (!orderRecord) {
    logTrace(logPrefix, "create_order_failed", {
      vendorId: order?.vendor_id || null,
      customerUserId: order?.user_id || null,
      cartId: order?.cart_id || null,
      status: order?.status || null,
      code: lastError?.code || null,
      message: lastError?.message || null,
    });
    throw new Error(lastError?.message || "Failed to create order");
  }

  const orderItems = Array.isArray(items)
    ? items.map((item) => ({
        order_id: orderRecord.id,
        listing_id: item.listing_id || null,
        title: item.title,
        unit_price: item.unit_price,
        image_url: item.image_url || null,
        quantity: item.quantity,
      }))
    : [];

  if (orderItems.length > 0) {
    const { error: itemsError } = await client.from("order_items").insert(orderItems);
    if (itemsError) {
      logTrace(logPrefix, "create_order_items_failed", {
        orderId: orderRecord.id,
        orderNumber: orderRecord.order_number,
        listingIds: orderItems.map((item) => item.listing_id).filter(Boolean),
        code: itemsError.code || null,
        message: itemsError.message || null,
      });
      throw new Error(itemsError.message || "Failed to save order items");
    }
  }

  logTrace(logPrefix, "create_order_success", {
    orderId: orderRecord.id,
    orderNumber: orderRecord.order_number,
    status: orderRecord.status || null,
    vendorId: orderRecord.vendor_id || null,
    customerUserId: orderRecord.user_id || null,
    listingIds: orderItems.map((item) => item.listing_id).filter(Boolean),
  });

  return orderRecord;
}

export async function findOrderByStripeContext(client, options = {}) {
  if (options.orderId) {
    const { data } = await client
      .from("orders")
      .select("id,order_number,status,paid_at,vendor_id,user_id,cart_id")
      .eq("id", options.orderId)
      .maybeSingle();
    if (data?.id) return data;
  }

  if (options.sessionId) {
    const { data } = await client
      .from("orders")
      .select("id,order_number,status,paid_at,vendor_id,user_id,cart_id")
      .eq("stripe_checkout_session_id", options.sessionId)
      .maybeSingle();
    if (data?.id) return data;
  }

  if (options.paymentIntentId) {
    const { data } = await client
      .from("orders")
      .select("id,order_number,status,paid_at,vendor_id,user_id,cart_id")
      .eq("stripe_payment_intent_id", options.paymentIntentId)
      .maybeSingle();
    if (data?.id) return data;
  }

  return null;
}

async function markOrderCartSubmitted({
  client,
  order,
  logPrefix = "[ORDER_FINALIZATION_TRACE]",
  tracePayload = {},
}) {
  if (!client || !order?.cart_id || !order?.user_id) {
    return { action: "skipped" };
  }

  const { data, error } = await client
    .from("carts")
    .update({
      status: "submitted",
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.cart_id)
    .eq("user_id", order.user_id)
    .eq("status", "active")
    .select("id,status")
    .maybeSingle();

  if (error) {
    logTrace(logPrefix, "mark_cart_submitted_failed", {
      ...tracePayload,
      matchedOrderId: order.id,
      cartId: order.cart_id,
      code: error.code || null,
      message: error.message || null,
    });
    throw new Error(error.message || "Failed to clear submitted cart");
  }

  logTrace(logPrefix, "mark_cart_submitted_success", {
    ...tracePayload,
    matchedOrderId: order.id,
    cartId: order.cart_id,
    cartStatus: data?.status || "submitted",
    updated: Boolean(data?.id),
  });

  return { action: data?.id ? "updated" : "unchanged" };
}

function buildPaidOrderUpdates({ order, session, paymentIntent }) {
  const chargeId =
    typeof paymentIntent?.latest_charge === "string"
      ? paymentIntent.latest_charge
      : paymentIntent?.latest_charge?.id || null;

  const updates = {
    updated_at: new Date().toISOString(),
  };

  if (session?.id) {
    updates.stripe_checkout_session_id = session.id;
  }

  const paymentIntentId =
    typeof session?.payment_intent === "string"
      ? session.payment_intent
      : paymentIntent?.id || null;
  if (paymentIntentId) {
    updates.stripe_payment_intent_id = paymentIntentId;
  }
  if (chargeId) {
    updates.stripe_charge_id = chargeId;
  }

  const isPaid =
    session?.payment_status === "paid" ||
    paymentIntent?.status === "succeeded" ||
    Boolean(paymentIntent?.id);
  if (isPaid) {
    updates.status = resolvePaidOrderStatus(order?.status);
    if (shouldWritePaidTimestamp(order?.status) && !order?.paid_at) {
      updates.paid_at = new Date().toISOString();
    }
  }

  if (
    typeof paymentIntent?.application_fee_amount === "number" &&
    paymentIntent.application_fee_amount >= 0
  ) {
    updates.platform_fee_amount = paymentIntent.application_fee_amount;
  }

  const platformFeeAmount =
    typeof paymentIntent?.application_fee_amount === "number" &&
    paymentIntent.application_fee_amount >= 0
      ? paymentIntent.application_fee_amount
      : Number(session?.metadata?.platform_fee_amount || paymentIntent?.metadata?.platform_fee_amount || NaN);

  const amountReceived =
    typeof paymentIntent?.amount_received === "number"
      ? paymentIntent.amount_received
      : typeof paymentIntent?.amount === "number"
        ? paymentIntent.amount
        : typeof session?.amount_total === "number"
          ? session.amount_total
          : null;

  const totalCents =
    typeof amountReceived === "number" && amountReceived >= 0
      ? amountReceived
      : Number(session?.metadata?.total_cents || paymentIntent?.metadata?.total_cents || NaN);

  if (Number.isFinite(platformFeeAmount) && platformFeeAmount >= 0) {
    updates.fees = centsToDollars(platformFeeAmount);
  }

  if (Number.isFinite(totalCents) && totalCents >= 0) {
    updates.total = centsToDollars(totalCents);
    if (Number.isFinite(platformFeeAmount) && platformFeeAmount >= 0) {
      updates.subtotal = centsToDollars(Math.max(totalCents - platformFeeAmount, 0));
    }
  }

  if (typeof amountReceived === "number" && amountReceived >= 0) {
    updates.total = centsToDollars(amountReceived);
  }

  const currency = paymentIntent?.currency || session?.currency || null;
  if (currency) {
    updates.currency = currency;
  }

  return updates;
}

export async function finalizePaidOrderFromCheckoutSession({
  client,
  session,
  paymentIntent = null,
  logPrefix = "[ORDER_FINALIZATION_TRACE]",
}) {
  const order = await findOrderByStripeContext(client, {
    orderId: String(session?.metadata?.order_id || "").trim() || null,
    sessionId: session?.id || null,
    paymentIntentId:
      typeof session?.payment_intent === "string" ? session.payment_intent : paymentIntent?.id || null,
  });

  const tracePayload = {
    sessionId: session?.id || null,
    paymentIntentId:
      typeof session?.payment_intent === "string" ? session.payment_intent : paymentIntent?.id || null,
    flowType: String(session?.metadata?.checkout_flow || "").trim() || "unknown",
    listingId: String(session?.metadata?.listing_id || "").trim() || null,
    businessId: String(session?.metadata?.business_id || "").trim() || null,
    customerUserId: String(session?.metadata?.customer_user_id || "").trim() || null,
    orderId: String(session?.metadata?.order_id || "").trim() || null,
    paymentStatus: session?.payment_status || paymentIntent?.status || null,
  };

  if (!order?.id) {
    logTrace(logPrefix, "finalize_checkout_missing_order", tracePayload);
    return { order: null, action: "missing" };
  }

  const updates = buildPaidOrderUpdates({ order, session, paymentIntent });
  const nextStatus = updates.status || order.status || null;

  const { error } = await client.from("orders").update(updates).eq("id", order.id);
  if (error) {
    logTrace(logPrefix, "finalize_checkout_failed", {
      ...tracePayload,
      matchedOrderId: order.id,
      code: error.code || null,
      message: error.message || null,
    });
    throw new Error(error.message || "Failed to finalize paid order");
  }

  logTrace(logPrefix, "finalize_checkout_success", {
    ...tracePayload,
    matchedOrderId: order.id,
    orderNumber: order.order_number || null,
    previousStatus: order.status || null,
    nextStatus,
  });

  await markOrderCartSubmitted({
    client,
    order,
    logPrefix,
    tracePayload,
  });

  if (nextStatus === "requested" && order.status !== "requested") {
    await maybeCreateOrderRequestedNotifications({
      client,
      order,
      logPrefix,
    });
  }

  return { order, action: nextStatus === order.status ? "updated" : "finalized", nextStatus };
}

export async function finalizePaidOrderFromPaymentIntent({
  client,
  paymentIntent,
  logPrefix = "[ORDER_FINALIZATION_TRACE]",
}) {
  const order = await findOrderByStripeContext(client, {
    orderId: String(paymentIntent?.metadata?.order_id || "").trim() || null,
    paymentIntentId: paymentIntent?.id || null,
  });

  const tracePayload = {
    sessionId: null,
    paymentIntentId: paymentIntent?.id || null,
    flowType: String(paymentIntent?.metadata?.checkout_flow || "").trim() || "unknown",
    listingId: String(paymentIntent?.metadata?.listing_id || "").trim() || null,
    businessId: String(paymentIntent?.metadata?.business_id || "").trim() || null,
    customerUserId: String(paymentIntent?.metadata?.customer_user_id || "").trim() || null,
    orderId: String(paymentIntent?.metadata?.order_id || "").trim() || null,
    paymentStatus: paymentIntent?.status || null,
  };

  if (!order?.id) {
    logTrace(logPrefix, "finalize_payment_intent_missing_order", tracePayload);
    return { order: null, action: "missing" };
  }

  const updates = buildPaidOrderUpdates({ order, paymentIntent });
  const nextStatus = updates.status || order.status || null;

  const { error } = await client.from("orders").update(updates).eq("id", order.id);
  if (error) {
    logTrace(logPrefix, "finalize_payment_intent_failed", {
      ...tracePayload,
      matchedOrderId: order.id,
      code: error.code || null,
      message: error.message || null,
    });
    throw new Error(error.message || "Failed to finalize paid order");
  }

  logTrace(logPrefix, "finalize_payment_intent_success", {
    ...tracePayload,
    matchedOrderId: order.id,
    orderNumber: order.order_number || null,
    previousStatus: order.status || null,
    nextStatus,
  });

  await markOrderCartSubmitted({
    client,
    order,
    logPrefix,
    tracePayload,
  });

  if (nextStatus === "requested" && order.status !== "requested") {
    await maybeCreateOrderRequestedNotifications({
      client,
      order,
      logPrefix,
    });
  }

  return { order, action: nextStatus === order.status ? "updated" : "finalized", nextStatus };
}

export async function markStripePaymentFailed({
  client,
  paymentIntent,
  logPrefix = "[ORDER_FINALIZATION_TRACE]",
}) {
  const order = await findOrderByStripeContext(client, {
    orderId: String(paymentIntent?.metadata?.order_id || "").trim() || null,
    paymentIntentId: paymentIntent?.id || null,
  });

  const tracePayload = {
    paymentIntentId: paymentIntent?.id || null,
    flowType: String(paymentIntent?.metadata?.checkout_flow || "").trim() || "unknown",
    listingId: String(paymentIntent?.metadata?.listing_id || "").trim() || null,
    businessId: String(paymentIntent?.metadata?.business_id || "").trim() || null,
    customerUserId: String(paymentIntent?.metadata?.customer_user_id || "").trim() || null,
    orderId: String(paymentIntent?.metadata?.order_id || "").trim() || null,
  };

  if (!order?.id) {
    logTrace(logPrefix, "payment_failed_missing_order", tracePayload);
    return { order: null, action: "missing" };
  }

  const chargeId =
    typeof paymentIntent?.latest_charge === "string"
      ? paymentIntent.latest_charge
      : paymentIntent?.latest_charge?.id || null;

  const updates = {
    status: resolvePaymentFailedStatus(order.status),
    stripe_payment_intent_id: paymentIntent.id,
    stripe_charge_id: chargeId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await client.from("orders").update(updates).eq("id", order.id);
  if (error) {
    logTrace(logPrefix, "payment_failed_update_failed", {
      ...tracePayload,
      matchedOrderId: order.id,
      code: error.code || null,
      message: error.message || null,
    });
    throw new Error(error.message || "Failed to update failed payment");
  }

  logTrace(logPrefix, "payment_failed_update_success", {
    ...tracePayload,
    matchedOrderId: order.id,
    orderNumber: order.order_number || null,
    previousStatus: order.status || null,
    nextStatus: updates.status,
  });

  return { order, action: "updated", nextStatus: updates.status };
}

async function fetchPendingStripeOrders({
  client,
  vendorId = null,
  userId = null,
  orderIds = null,
  limit = 25,
}) {
  let query = client
    .from("orders")
    .select(
      [
        "id",
        "order_number",
        "status",
        "paid_at",
        "vendor_id",
        "user_id",
        "stripe_checkout_session_id",
        "stripe_payment_intent_id",
      ].join(",")
    )
    .eq("status", "pending_payment")
    .or("stripe_checkout_session_id.not.is.null,stripe_payment_intent_id.not.is.null")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (vendorId) query = query.eq("vendor_id", vendorId);
  if (userId) query = query.eq("user_id", userId);
  if (Array.isArray(orderIds) && orderIds.length > 0) query = query.in("id", orderIds);

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || "Failed to load pending Stripe orders");
  }

  return Array.isArray(data) ? data : [];
}

async function reconcileSinglePendingStripeOrder({
  client,
  order,
  logPrefix = "[ORDER_FINALIZATION_TRACE]",
}) {
  const stripe = getStripe();

  if (order?.stripe_checkout_session_id) {
    const session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
    if (session?.payment_status === "paid") {
      return finalizePaidOrderFromCheckoutSession({
        client,
        session,
        logPrefix,
      });
    }

    logTrace(logPrefix, "reconcile_pending_checkout_unpaid", {
      orderId: order?.id || null,
      orderNumber: order?.order_number || null,
      sessionId: order?.stripe_checkout_session_id || null,
      paymentStatus: session?.payment_status || null,
    });
    return { order, action: "unchanged", nextStatus: order?.status || null };
  }

  if (order?.stripe_payment_intent_id) {
    const paymentIntent = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
    if (paymentIntent?.status === "succeeded") {
      return finalizePaidOrderFromPaymentIntent({
        client,
        paymentIntent,
        logPrefix,
      });
    }

    logTrace(logPrefix, "reconcile_pending_intent_unpaid", {
      orderId: order?.id || null,
      orderNumber: order?.order_number || null,
      paymentIntentId: order?.stripe_payment_intent_id || null,
      paymentStatus: paymentIntent?.status || null,
    });
    return { order, action: "unchanged", nextStatus: order?.status || null };
  }

  return { order, action: "missing_context", nextStatus: order?.status || null };
}

export async function reconcilePendingStripeOrders({
  client,
  vendorId = null,
  userId = null,
  orderIds = null,
  limit = 25,
  logPrefix = "[ORDER_FINALIZATION_TRACE]",
}) {
  const pendingOrders = await fetchPendingStripeOrders({
    client,
    vendorId,
    userId,
    orderIds,
    limit,
  });

  const results = [];
  for (const order of pendingOrders) {
    try {
      const result = await reconcileSinglePendingStripeOrder({
        client,
        order,
        logPrefix,
      });
      results.push({
        orderId: order.id,
        orderNumber: order.order_number || null,
        action: result?.action || "unknown",
        nextStatus: result?.nextStatus || order.status || null,
      });
    } catch (error) {
      logTrace(logPrefix, "reconcile_pending_failed", {
        orderId: order?.id || null,
        orderNumber: order?.order_number || null,
        sessionId: order?.stripe_checkout_session_id || null,
        paymentIntentId: order?.stripe_payment_intent_id || null,
        message: error?.message || null,
      });
      results.push({
        orderId: order.id,
        orderNumber: order.order_number || null,
        action: "error",
        nextStatus: order.status || null,
      });
    }
  }

  return results;
}
