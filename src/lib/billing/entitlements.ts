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
const PAID_STATUSES = new Set(["trialing", "active", "past_due"]);

export function planFor(sub: SubscriptionLike | null | undefined, now: Date = new Date()): PlanKey {
  if (!sub || !PAID_STATUSES.has(sub.status)) return "free";
  // A small grace window so a renewal webhook arriving late doesn't flicker access.
  if (sub.currentPeriodEnd.getTime() + 24 * 3600_000 < now.getTime()) return "free";
  return sub.planKey in plans ? (sub.planKey as PlanKey) : "free";
}

export function entitlementsFor(sub: SubscriptionLike | null | undefined, now?: Date): Entitlements {
  return plans[planFor(sub, now)].entitlements;
}
