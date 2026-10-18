import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { planForPriceId } from "./prices";

/**
 * Stripe webhook processing. Handlers never trust the event payload's snapshot: they re-fetch
 * the subscription so out-of-order delivery can't leave stale state, and each event id is
 * recorded so retries and replays are no-ops.
 */

const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
]);

type SubscriptionsApi = Pick<Stripe["subscriptions"], "retrieve">;

export type WebhookResult = "processed" | "duplicate" | "ignored";

export async function processStripeEvent(event: Stripe.Event, api: SubscriptionsApi): Promise<WebhookResult> {
  if (!HANDLED.has(event.type)) return "ignored";
  if (await prisma.stripeEvent.findUnique({ where: { id: event.id } })) return "duplicate";

  const subscriptionId = subscriptionIdOf(event);
  if (subscriptionId) {
    const sub = await api.retrieve(subscriptionId);
    await syncSubscription(sub, event.type === "checkout.session.completed" ? clientReferenceOf(event) : null);
  }
  // Recorded after the write succeeds: if syncing throws, Stripe retries and we try again.
  await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } }).catch((e: { code?: string }) => {
    if (e.code !== "P2002") throw e; // concurrent delivery of the same event already recorded it
  });
  return "processed";
}

function subscriptionIdOf(event: Stripe.Event): string | null {
  const obj = event.data.object as { object?: string; id?: string; subscription?: string | { id: string } | null };
  if (obj.object === "subscription") return obj.id ?? null;
  if (obj.object === "checkout.session") {
    const s = obj.subscription;
    return typeof s === "string" ? s : (s?.id ?? null);
  }
  return null;
}

function clientReferenceOf(event: Stripe.Event): string | null {
  const s = event.data.object as Stripe.Checkout.Session;
  return s.client_reference_id ?? s.metadata?.userId ?? null;
}

/** Upsert our Subscription row from Stripe's current view of the subscription. */
export async function syncSubscription(sub: Stripe.Subscription, userIdHint: string | null = null) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const user =
    (await prisma.user.findUnique({ where: { stripeCustomerId: customerId } })) ??
    (userIdHint || sub.metadata?.userId
      ? await prisma.user.findUnique({ where: { id: (userIdHint ?? sub.metadata.userId)! } })
      : null);
  if (!user) throw new Error(`No user for Stripe customer ${customerId} (subscription ${sub.id})`);
  if (!user.stripeCustomerId) {
    await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
  }

  const item = sub.items.data[0];
  const mapped = item ? planForPriceId(item.price.id) : null;
  if (!mapped) throw new Error(`Subscription ${sub.id} uses an unknown price ${item?.price.id}`);

  const data = {
    userId: user.id,
    planKey: mapped.plan,
    interval: mapped.interval ? (mapped.interval === "annual" ? "year" : "month") : (item.price.recurring?.interval ?? "month"),
    status: sub.status,
    trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    currentPeriodEnd: new Date(item.current_period_end * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
  await prisma.$transaction(async (tx) => {
    // One subscription per user: a new one (e.g. re-subscribing after cancel) replaces the old row.
    await tx.subscription.deleteMany({ where: { userId: user.id, NOT: { stripeSubscriptionId: sub.id } } });
    await tx.subscription.upsert({ where: { stripeSubscriptionId: sub.id }, create: { stripeSubscriptionId: sub.id, ...data }, update: data });
    if (sub.trial_start && !user.trialUsedAt) {
      await tx.user.update({ where: { id: user.id }, data: { trialUsedAt: new Date(sub.trial_start * 1000) } });
    }
  });
}
