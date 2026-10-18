import Stripe from "stripe";

let client: Stripe | undefined;

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key, { appInfo: { name: "FedFlow" } });
  return client;
}

export const billingConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);
