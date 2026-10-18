/** Recipient -> ticker matching settings (Phase 2). */
export const mappingConfig = {
  /** Matches below this confidence are labeled "possible match" and excluded from headline totals. */
  confidenceThreshold: 0.85,
} as const;
