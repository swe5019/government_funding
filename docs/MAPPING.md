# Recipient → ticker mapping

Code: `src/lib/mapping/` (pure logic) and `src/jobs/match-tickers.ts` (pipeline).

## Pipeline

1. **Eligible recipients**: type BUSINESS or UNKNOWN, with at least `minObligationUsd` ($1M) net
   obligated across loaded history (REALTIME view). Incremental runs only revisit recipients that are
   new or changed; any SEC company refresh forces a full run.
2. **Roll-up** (`rollup.ts`): follow `ultimateParentUei` (SAM.gov) or else `parentUei` (USAspending) up
   to 3 levels, stopping at cycles. The root's name comes from its own recipient record when it has one,
   otherwise from the child's `parentName`.
3. **Candidates** (SQL): for each root's normalized name, companies on major exchanges whose normalized
   name or former SEC name is trigram-similar (≥ 0.45), or a multi-word company name that prefixes the
   recipient's name ("LOCKHEED MARTIN" in "LOCKHEED MARTIN SPACE"). Top 5 per source.
4. **Scoring** (`score.ts`):

   | Case | Confidence |
   |---|---|
   | Exact normalized name | 0.97 |
   | Exact former SEC name | 0.92 |
   | Company name is a multi-word prefix | 0.55 + 0.35 × share of words, max 0.84 |
   | Other fuzzy | ½ trigram similarity + ½ shared-word ratio, max 0.84 (0.90 if near-identical) |
   | Former-name fuzzy | −0.03 |
   | Recipient name has an institutional word the company lacks (UNIVERSITY, FOUNDATION, COUNTY…) | −0.20 |
   | Runner-up within 0.05 (ambiguous) | −0.15 |
   | Subsidiary inheriting a parent's match | parent × 0.98 |

   Non-business recipients are never matched. Below 0.50 nothing is stored.
5. **Display** (`display.ts`, mirrored in SQL by `sql.ts`): APPROVED/CORRECTED, or PENDING ≥ 0.85, is
   *confirmed*; PENDING < 0.85 is a *possible match* (always labeled, excluded from confirmed totals);
   REJECTED is hidden.
6. **Company totals**: `CompanyAwardMonthly` is rebuilt after matching and after each admin decision, in
   both REALTIME and DELAYED views, once with confirmed matches only and once including possible matches.

## Human review

Reviewer decisions (APPROVED, REJECTED, CORRECTED, or method MANUAL) are never overwritten by the
matcher. A decision on a parent's group applies to its subsidiaries, and subsidiaries discovered later
inherit an approved/corrected parent (confidence 0.98) or stay unmatched under a rejected one. "Reopen"
hands rows back to automatic matching. Every decision writes an `AuditLog` row.

## Known limits

- SAM.gov parent fields may be absent at the public access tier; USAspending's parent UEI is the fallback.
- Subsidiaries whose names differ from the parent and have no parent link (e.g. acquired companies still
  registered separately) are only caught by review via the "Unmatched" tab, until EDGAR Exhibit 21
  subsidiary lists are added in Phase 6.
- Foreign parents without SEC-registered tickers can't be matched.
