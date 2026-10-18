import { plans, type PlanKey } from "@/config/plans";

export type Interval = "monthly" | "annual";

/** Stripe price ID for a plan/interval, from the env var named in src/config/plans.ts. */
export function priceIdFor(plan: PlanKey, interval: Interval, env: Record<string, string | undefined> = process.env): string {
  const cfg = plans[plan].prices[interval];
  if (!cfg) throw new Error(`Plan "${plan}" has no ${interval} price`);
  const id = env[cfg.stripePriceIdEnv];
  if (!id) throw new Error(`${cfg.stripePriceIdEnv} is not set (Stripe price ID for ${plan} ${interval})`);
  return id;
}

/**
 * Reverse lookup used by the webhook: which plan/interval does a Stripe price belong to?
 * Old prices kept for existing subscribers after a price change go in STRIPE_PRICE_<PLAN>_LEGACY
 * (comma-separated); their interval is unknown here (null) and is read from Stripe instead.
 */
export function planForPriceId(
  priceId: string,
  env: Record<string, string | undefined> = process.env,
): { plan: PlanKey; interval: Interval | null } | null {
  for (const plan of Object.values(plans)) {
    for (const interval of ["monthly", "annual"] as const) {
      const cfg = plan.prices[interval];
      if (cfg && env[cfg.stripePriceIdEnv] === priceId) return { plan: plan.key, interval };
    }
    const legacy = env[`STRIPE_PRICE_${plan.key.toUpperCase()}_LEGACY`]?.split(",").map((s) => s.trim());
    if (legacy?.includes(priceId)) return { plan: plan.key, interval: null };
  }
  return null;
}
