import { plans, type Entitlements, type PlanKey } from "@/config/plans";

export interface SubscriptionLike {
  planKey: string;
  status: string;
  currentPeriodEnd: Date;
}

/**
 * Stripe statuses that grant the paid plan. past_due keeps access while Stripe retries the
 * card (its dunning settings decide when to cancel); everything else is free.
 */
export const PAID_STATUSES_LIST = ["trialing", "active", "past_due"] as const;
const PAID_STATUSES = new Set<string>(PAID_STATUSES_LIST);
/** Late-webhook grace after currentPeriodEnd (also used by SQL in the alerts job). */
export const PERIOD_GRACE_MS = 24 * 3600_000;

export function planFor(sub: SubscriptionLike | null | undefined, now: Date = new Date()): PlanKey {
  if (!sub || !PAID_STATUSES.has(sub.status)) return "free";
  // A small grace window so a renewal webhook arriving late doesn't flicker access.
  if (sub.currentPeriodEnd.getTime() + PERIOD_GRACE_MS < now.getTime()) return "free";
  return sub.planKey in plans ? (sub.planKey as PlanKey) : "free";
}

export function entitlementsFor(sub: SubscriptionLike | null | undefined, now?: Date): Entitlements {
  return plans[planFor(sub, now)].entitlements;
}
