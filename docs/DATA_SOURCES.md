# Data sources

All sources are public. Every record shown in the app links back to the original government record.

| Source | What we use | Job | Cadence | Limits / notes |
|---|---|---|---|---|
| **USAspending.gov** bulk download API | Prime contract and assistance transactions, recipients, agencies | `usaspending-backfill`, `usaspending-daily` | Daily (+3-day overlap) | No key; we space requests ≥1s apart. Basis of all award totals. |
| **SEC EDGAR** `company_tickers_exchange.json` | Public companies, tickers, exchanges | `edgar-companies` | Weekly | `SEC_USER_AGENT` required; ≤8 req/s (SEC allows 10). |
| **SEC EDGAR** submissions API | Former names, SIC/sector; 8-K list; latest 10-K | `edgar-companies`, `edgar-filings` | Weekly / daily | 8-Ks from the last 30 days are fetched and keyword-screened for government-contract language ("may relate to federal contracts"). |
| **SEC EDGAR** 10-K Exhibit 21 | Subsidiary names → `CompanyAlias` (`EX21_SUBSIDIARY`) | `edgar-filings` | When a new 10-K appears | Exact subsidiary-name matches score 0.90 (confirmed); fuzzy ones stay in review. Only names ending in a legal form (Inc, LLC, Ltd…) are kept. |
| **SAM.gov** Entity API | Ultimate parent UEI for top recipients | `sam-parents` | Daily, budgeted | `SAM_API_KEY`; quota shared with award notices (`SAM_DAILY_LIMIT`). Parent fields may be missing at the public tier. |
| **SAM.gov** Opportunities API (award notices) | Contract award notices with awardee UEI | `sam-opportunities` | Daily, last 7 days | Up to 10 requests/run. Linked to companies by awardee UEI. |
| **Federal Register** API | Rules and notices per program (`src/config/programs.ts` → `federalRegister`) | `federal-register` | Daily, last 30 days | No key. Shown on program pages. |
| **defense.gov** daily contract announcements | DoD contracts ≥ $7.5M, same day | `dod-announcements` | Daily (RSS) | Parsed from HTML: contractor, announced amount, contract number, contracting activity. Linked by contract number to USAspending awards, else by exact unique name. Announced amounts often include options. Re-linked for 90 days. |
| **Market data** (licensed vendor, TBD) | Daily prices, market cap | `prices` | Daily | `MARKET_DATA_PROVIDER`; nothing shown until configured. |

## Early signals vs. totals

DoD announcements, SAM.gov award notices and 8-Ks are shown as **early signals** on company pages and in the
Pro feed. They are *not* added to award totals (which come only from USAspending obligations), because
announced values often include unexercised options and the same award later appears in USAspending.

## Verifying source formats

This codebase was developed without network access to these sources, against documented formats and
fixtures in `tests/fixtures/`. Before relying on a new source in production, run each job once with a small
limit and check `/admin/ingestion`:

```bash
pnpm ingest dod-announcements          # check parsed counts; "no contracts parsed" means the page layout changed
pnpm ingest federal-register
pnpm ingest sam-opportunities
pnpm ingest edgar-filings --limit 20
```

The DoD RSS URL and API bases are in `src/config/data.ts`.
