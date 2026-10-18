/** Limits and defaults for Pro features (watchlists, alerts, feed, screener, export). */
export const featureConfig = {
  watchlists: {
    maxWatchlists: 5,
    maxItemsPerWatchlist: 100,
    /** Threshold pre-filled when a company is added (USD); users can change or clear it. */
    defaultAlertThresholdUsd: 1_000_000,
  },
  alerts: {
    /** Only awards published within this many days are alerted (covers a missed daily run). */
    lookbackDays: 3,
    /** At most this many awards listed per digest email (the rest are summarized). */
    maxAwardsPerEmail: 25,
  },
  feed: {
    defaultMinUsd: 10_000_000,
    minUsdOptions: [1_000_000, 10_000_000, 50_000_000, 100_000_000],
    dayOptions: [1, 7, 30],
    defaultDays: 7,
    pageSize: 100,
  },
  screener: {
    pageSize: 100,
  },
  export: {
    /** Hard cap on rows per CSV download. */
    maxRows: 50_000,
  },
} as const;
