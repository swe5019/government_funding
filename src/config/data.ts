/** Data-pipeline settings shared by ingestion jobs and the UI. */
export const dataConfig = {
  /** How many years of history the backfill loads. */
  backfillYears: 3,
  /** Daily incremental re-reads this many days before the last loaded date to catch late edits. */
  incrementalOverlapDays: 3,
  /** Rows per bulk upsert statement. */
  upsertBatchSize: 2000,
  usaspending: {
    apiBase: "https://api.usaspending.gov",
    awardUrlBase: "https://www.usaspending.gov/award/",
    /** Polling interval and ceiling for async bulk downloads. */
    downloadPollMs: 15_000,
    downloadTimeoutMs: 3 * 60 * 60 * 1000,
    /** Minimum gap between API calls (politeness; USAspending publishes no hard limit). */
    minRequestGapMs: 1_000,
  },
  dod: {
    /** defense.gov "Contracts" RSS feed (daily announcements of contracts >= $7.5M). */
    rssUrl: "https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=400&Site=945&max=10",
    /** Unlinked announcements are re-checked against new USAspending data for this many days. */
    relinkDays: 90,
  },
  federalRegister: {
    apiBase: "https://www.federalregister.gov/api/v1",
    /** Each run re-reads this many days of documents (edits and late indexing). */
    lookbackDays: 30,
  },
  samOpportunities: {
    apiBase: "https://api.sam.gov/opportunities/v2/search",
    lookbackDays: 7,
    pageSize: 1000,
  },
} as const;
