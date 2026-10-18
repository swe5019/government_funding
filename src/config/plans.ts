/**
 * Tiers, prices and feature gates. Change pricing here without touching code.
 * Stripe price IDs come from env so test/live modes can differ (wired up in Phase 4).
 */
export type PlanKey = "free" | "pro";

export interface Entitlements {
  /** Records become visible this many days after publication. 0 = as soon as ingested. */
  dataDelayDays: number;
  /** How far back award history is shown. null = everything we have. */
  historyYears: number | null;
  watchlists: boolean;
  emailAlerts: boolean;
  largeAwardsFeed: boolean;
  csvExport: boolean;
  screener: boolean;
}

export interface Plan {
  key: PlanKey;
  name: string;
  description: string;
  prices: {
    monthly?: { amountUsd: number; stripePriceIdEnv: string };
    annual?: { amountUsd: number; stripePriceIdEnv: string };
  };
  trialDays: number;
  entitlements: Entitlements;
}

export const plans: Record<PlanKey, Plan> = {
  free: {
    key: "free",
    name: "Free",
    description: "Search awards and company pages with a 7-day delay.",
    prices: {},
    trialDays: 0,
    entitlements: {
      dataDelayDays: 7,
      historyYears: 2,
      watchlists: false,
      emailAlerts: false,
      largeAwardsFeed: false,
      csvExport: false,
      screener: false,
    },
  },
  pro: {
    key: "pro",
    name: "Pro",
    description: "Daily data, alerts, screener, full history and CSV export.",
    prices: {
      monthly: { amountUsd: 19, stripePriceIdEnv: "STRIPE_PRICE_PRO_MONTHLY" },
      annual: { amountUsd: 190, stripePriceIdEnv: "STRIPE_PRICE_PRO_ANNUAL" },
    },
    trialDays: 7,
    entitlements: {
      dataDelayDays: 0,
      historyYears: null,
      watchlists: true,
      emailAlerts: true,
      largeAwardsFeed: true,
      csvExport: true,
      screener: true,
    },
  },
};

/** The free tier's delay also defines the DELAYED aggregate view built by the rollup job. */
export const FREE_TIER_DELAY_DAYS = plans.free.entitlements.dataDelayDays;
