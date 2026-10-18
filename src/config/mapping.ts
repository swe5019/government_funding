/** Recipient -> ticker matching settings. */
export const mappingConfig = {
  /** Matches below this confidence are labeled "possible match" and excluded from headline totals. */
  confidenceThreshold: 0.85,
  /** Only recipients with at least this much net obligated (REALTIME, all loaded history) are auto-matched. */
  minObligationUsd: 1_000_000,
  /** Exchanges (as named in SEC's company_tickers_exchange.json) eligible for automatic matching. */
  majorExchanges: ["NYSE", "Nasdaq", "NYSE American", "CBOE"],
  /** Minimum pg_trgm similarity for a company to be considered a fuzzy candidate. */
  candidateMinSimilarity: 0.45,
  /** Subsidiaries inherit their parent's confidence times this factor. */
  rollupFactor: 0.98,
} as const;
