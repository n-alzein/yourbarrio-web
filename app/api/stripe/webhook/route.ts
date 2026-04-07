import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  finalizePaidOrderFromCheckoutSession,
  finalizePaidOrderFromPaymentIntent,
  markStripePaymentFailed,
} from "@/lib/orders/persistence";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function markEventStarted(client: any, event: Stripe.Event) {
  const { error } = await client.from("stripe_events").insert({
    id: event.id,
    type: event.type,
    payload: event as any,
  });

  if (!error) return { duplicate: false };
  if (error.code === "23505") return { duplicate: true };
  throw new Error(error.message || "Failed to store Stripe event");
}

async function forgetEvent(client: any, eventId: string) {
  await client.from("stripe_events").delete().eq("id", eventId);
}

async function handleAccountUpdated(client: any, account: Stripe.Account) {
  const accountId = account.id?.trim();
  if (!accountId) return;

  const { error } = await client
    .from("businesses")
    .update({
      stripe_charges_enabled: account.charges_enabled === true,
      stripe_payouts_enabled: account.payouts_enabled === true,
      stripe_details_submitted: account.details_submitted === true,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_account_id", accountId);

  if (error) {
    throw new Error(error.message || "Failed to update business Stripe status");
  }
}

async function handleCheckoutCompleted(
  client: any,
  session: Stripe.Checkout.Session
) {
  await finalizePaidOrderFromCheckoutSession({
    client,
    session,
    logPrefix: "[ORDER_FINALIZATION_TRACE]",
  });
}

async function handlePaymentIntentSucceeded(
  client: any,
  paymentIntent: Stripe.PaymentIntent
) {
  await finalizePaidOrderFromPaymentIntent({
    client,
    paymentIntent,
    logPrefix: "[ORDER_FINALIZATION_TRACE]",
  });
}

async function handlePaymentIntentFailed(
  client: any,
  paymentIntent: Stripe.PaymentIntent
) {
  await markStripePaymentFailed({
    client,
    paymentIntent,
    logPrefix: "[ORDER_FINALIZATION_TRACE]",
  });
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return jsonError("Missing Stripe signature", 400);
  }

  const client = getSupabaseServerClient();
  if (!client) {
    return jsonError("Missing server data client", 500);
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      getStripeWebhookSecret()
    );
  } catch (error: any) {
    return jsonError(error?.message || "Invalid Stripe signature", 400);
  }

  try {
    const state = await markEventStarted(client, event);
    if (state.duplicate) {
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }

    if (process.env.NODE_ENV !== "production") {
      console.warn("[ORDER_FINALIZATION_TRACE]", "stripe_event_received", {
        eventId: event.id,
        eventType: event.type,
      });
    }

    switch (event.type) {
      case "account.updated":
        await handleAccountUpdated(client, event.data.object as Stripe.Account);
        break;
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          client,
          event.data.object as Stripe.Checkout.Session
        );
        break;
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(
          client,
          event.data.object as Stripe.PaymentIntent
        );
        break;
      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(
          client,
          event.data.object as Stripe.PaymentIntent
        );
        break;
      default:
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    await forgetEvent(client, event.id);
    return jsonError(error?.message || "Failed to process Stripe webhook", 500);
  }
}
