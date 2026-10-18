import type Stripe from "stripe";
import { stripe } from "@/lib/billing/stripe";
import { processStripeEvent } from "@/lib/billing/webhook";

/** Stripe webhook endpoint. Verifies the signature on the raw body; 2xx only after the DB write. */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("Missing signature", { status: 400 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    const result = await processStripeEvent(event, stripe().subscriptions);
    return Response.json({ received: true, result });
  } catch (err) {
    console.error(`stripe webhook ${event.id} (${event.type}) failed:`, err);
    return new Response("Processing failed", { status: 500 });
  }
}
