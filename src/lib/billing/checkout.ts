import { plans } from "@/config/plans";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/db";
import type { ViewerUser } from "@/lib/gating/viewer";
import { priceIdFor, type Interval } from "./prices";
import { stripe } from "./stripe";

async function customerFor(user: ViewerUser): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe().customers.create(
    { email: user.email, name: user.name ?? undefined, metadata: { userId: user.id } },
    { idempotencyKey: `customer-${user.id}` },
  );
  await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

/**
 * Stripe Checkout for the Pro plan. First-time subscribers get the configured trial; a card is
 * always collected and billing starts automatically when the trial ends.
 */
export async function createCheckoutUrl(user: ViewerUser, interval: Interval): Promise<string> {
  const pro = plans.pro;
  const trialDays = !user.trialUsedAt && pro.trialDays > 0 ? pro.trialDays : undefined;
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: await customerFor(user),
    client_reference_id: user.id,
    line_items: [{ price: priceIdFor("pro", interval), quantity: 1 }],
    payment_method_collection: "always",
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { userId: user.id },
      ...(trialDays
        ? { trial_period_days: trialDays, trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } } }
        : {}),
    },
    metadata: { userId: user.id },
    success_url: `${siteConfig.url}/account?checkout=success`,
    cancel_url: `${siteConfig.url}/pricing?checkout=cancelled`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function createPortalUrl(user: ViewerUser): Promise<string> {
  if (!user.stripeCustomerId) throw new Error("No billing account yet");
  const portal = await stripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${siteConfig.url}/account`,
  });
  return portal.url;
}
