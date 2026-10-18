import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type Stripe from "stripe";

/**
 * Stripe webhook processing against a real Postgres, with Stripe's API mocked (no network).
 * Needs TEST_DATABASE_URL.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Stripe billing (integration)", async () => {
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
  process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro_monthly";
  process.env.STRIPE_PRICE_PRO_ANNUAL = "price_pro_annual";

  const { prisma } = await import("@/lib/db");
  const { processStripeEvent } = await import("@/lib/billing/webhook");
  const { planFor } = await import("@/lib/billing/entitlements");
  const { stripe } = await import("@/lib/billing/stripe");
  const { POST } = await import("@/app/api/stripe/webhook/route");

  const day = 86_400;
  const t0 = Math.floor(Date.now() / 1000);
  let current: Stripe.Subscription;
  const api = { retrieve: async () => current } as unknown as Pick<Stripe["subscriptions"], "retrieve">;

  const subscription = (over: Partial<Stripe.Subscription> = {}, price = "price_pro_monthly"): Stripe.Subscription =>
    ({
      id: "sub_1",
      object: "subscription",
      customer: "cus_1",
      status: "trialing",
      trial_start: t0,
      trial_end: t0 + 7 * day,
      cancel_at_period_end: false,
      metadata: { userId: "user_1" },
      items: { object: "list", data: [{ price: { id: price }, current_period_end: t0 + 7 * day }] },
      ...over,
    }) as unknown as Stripe.Subscription;

  const event = (id: string, type: string, object: unknown): Stripe.Event =>
    ({ id, object: "event", type, data: { object } }) as unknown as Stripe.Event;

  const planOf = async () => planFor(await prisma.subscription.findUnique({ where: { userId: "user_1" } }));

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE "StripeEvent", "Subscription", "Session", "Account", "AuditLog", "User" CASCADE`);
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE "StripeEvent", "Subscription", "User" CASCADE`);
    await prisma.user.create({ data: { id: "user_1", email: "investor@example.com" } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("checkout completion starts the trial, links the customer and grants Pro", async () => {
    current = subscription();
    const res = await processStripeEvent(
      event("evt_1", "checkout.session.completed", { object: "checkout.session", subscription: "sub_1", client_reference_id: "user_1" }),
      api,
    );
    expect(res).toBe("processed");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: "user_1" }, include: { subscription: true } });
    expect(user.stripeCustomerId).toBe("cus_1");
    expect(user.trialUsedAt).not.toBeNull();
    expect(user.subscription).toMatchObject({ planKey: "pro", interval: "month", status: "trialing" });
    expect(await planOf()).toBe("pro");
  });

  it("replayed events are no-ops", async () => {
    current = subscription();
    const e = event("evt_2", "customer.subscription.created", current);
    expect(await processStripeEvent(e, api)).toBe("processed");
    current = subscription({ status: "canceled" });
    expect(await processStripeEvent(e, api)).toBe("duplicate");
    expect(await planOf()).toBe("pro");
  });

  it("uses Stripe's current state, not the event snapshot (out-of-order delivery)", async () => {
    current = subscription({ status: "active" }, "price_pro_annual");
    // An older "trialing" snapshot arrives late; we re-fetch and store the current state.
    await processStripeEvent(event("evt_3", "customer.subscription.updated", subscription()), api);
    expect(await prisma.subscription.findUnique({ where: { userId: "user_1" } })).toMatchObject({ status: "active", interval: "year" });
  });

  it("cancellation and deletion drop the user to free", async () => {
    current = subscription({ status: "active" });
    await processStripeEvent(event("evt_4", "customer.subscription.updated", current), api);
    current = subscription({ status: "active", cancel_at_period_end: true });
    await processStripeEvent(event("evt_5", "customer.subscription.updated", current), api);
    expect(await planOf()).toBe("pro"); // still paid through the period
    current = subscription({ status: "canceled" });
    await processStripeEvent(event("evt_6", "customer.subscription.deleted", current), api);
    expect(await planOf()).toBe("free");
  });

  it("ignores unrelated events and fails loudly on unknown prices", async () => {
    expect(await processStripeEvent(event("evt_7", "invoice.paid", {}), api)).toBe("ignored");
    current = subscription({}, "price_unknown");
    await expect(processStripeEvent(event("evt_8", "customer.subscription.created", current), api)).rejects.toThrow(/unknown price/);
    // Not recorded as processed, so Stripe's retry will be attempted again.
    expect(await prisma.stripeEvent.findUnique({ where: { id: "evt_8" } })).toBeNull();
  });

  it("the endpoint rejects bad signatures and accepts signed events", async () => {
    const payload = JSON.stringify({ id: "evt_9", object: "event", type: "invoice.paid", data: { object: {} } });
    const bad = await POST(new Request("http://x/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": "t=1,v1=bad" } }));
    expect(bad.status).toBe(400);
    const header = stripe().webhooks.generateTestHeaderString({ payload, secret: "whsec_test_secret" });
    const ok = await POST(new Request("http://x/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": header } }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ received: true, result: "ignored" });
  });
});
