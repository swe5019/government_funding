# FedFlow

Tracks which publicly traded companies receive U.S. federal money (contracts, grants, program funding) and
how that relates to their stock. "FedFlow" is a placeholder name, set once in `src/config/site.ts`.

**Informational only. Not investment advice.**

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Schema, USAspending ingestion (3-year backfill + daily), basic search | ✅ built |
| 2 | Recipient → ticker mapping + admin review | ✅ built |
| 3 | Company and program pages with charts | next |
| 4 | Auth, Stripe, tier gating | |
| 5 | Watchlists, alerts, screener, CSV export | |
| 6 | SAM.gov, EDGAR, Federal Register, DoD announcements | |
| 7 | Tests, monitoring, SEO, deployment guide | |

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind 4 · Prisma 7 + PostgreSQL (Neon) ·
Vitest · GitHub Actions for scheduled ingestion.

## Local setup

```bash
pnpm install                      # also runs `prisma generate`
cp .env.example .env              # point DATABASE_URL / DIRECT_URL at a Postgres 16 database
pnpm db:migrate                   # apply migrations (enables pg_trgm)
pnpm db:seed                      # agency abbreviations so "NASA", "DOD" search works
pnpm ingest usaspending-file tests/fixtures/All_Contracts_PrimeTransactions_sample_1.csv
pnpm ingest usaspending-file tests/fixtures/All_Assistance_PrimeTransactions_sample_1.csv
pnpm ingest edgar-companies --file tests/fixtures/company_tickers_exchange.json
pnpm ingest match-tickers
ADMIN_USERNAME=admin ADMIN_PASSWORD=dev pnpm dev   # http://localhost:3000/search?q=lockheed, /admin
```

The fixture files contain illustrative records, not real awards.

## Ingestion

```bash
pnpm ingest usaspending-backfill            # last 3 years, month by month, contracts + assistance
pnpm ingest usaspending-backfill --month 2025-03 --kind contracts --limit 5000   # smoke test
pnpm ingest usaspending-daily               # everything modified since the last load (+3 day overlap)
pnpm ingest usaspending-agencies            # agency names + abbreviations
pnpm ingest rollup [--full]                 # rebuild search/summary aggregates
pnpm ingest --help
```

How it works (`src/jobs/`):

- **Source**: USAspending bulk download API (`/api/v2/bulk_download/awards/`) → zipped prime-transaction CSVs,
  one request per kind × month for the backfill and by `last_modified_date` for daily runs. No API key.
- **Idempotent**: government natural keys are primary keys; rows are bulk-upserted with
  `INSERT … ON CONFLICT`, and an older version of a record never overwrites a newer one. Re-running a load
  changes nothing.
- **Logged**: every attempt writes an `IngestionRun` row (rows read / upserted / skipped, error).
- **Retried**: HTTP calls back off on 429/5xx; each chunk is retried 3× with exponential backoff.
- **Resumable**: backfill chunks that already succeeded are skipped on re-run.
- **No overlap**: a Postgres advisory lock per job (requires the direct, unpooled connection).
- **Free-tier delay**: each transaction records `availableAt` (backfill: source last-modified date; daily: first
  seen). Aggregates are kept in two views — `REALTIME` and `DELAYED` (7 days, from `src/config/plans.ts`).

Scheduled runs: `.github/workflows/ingest.yml` (daily, plus manual dispatch for the backfill). Add the Neon
unpooled connection string as the `DIRECT_URL` repository secret.

## Recipient → ticker mapping

```bash
pnpm ingest edgar-companies        # SEC tickers (+ former names, SIC); weekly
pnpm ingest sam-parents            # SAM.gov ultimate parents for top recipients; daily, budgeted
pnpm ingest match-tickers [--full] # match + rebuild company totals (also runs after usaspending-daily)
```

Awards go to legal entities, often subsidiaries. Each recipient is rolled up to its top parent
(SAM.gov ultimate parent, else the USAspending parent UEI), the parent's name is matched against
companies listed on NYSE / Nasdaq / NYSE American / Cboe (and their former SEC names), and subsidiaries
inherit the result. Every match stores a confidence score and evidence. At or above 0.85 it is shown as
a confirmed ticker; below that it is always labeled **"possible match"** and kept out of headline totals.
Thresholds live in `src/config/mapping.ts`; details in [docs/MAPPING.md](docs/MAPPING.md).

Review at `/admin/matches` (HTTP Basic auth via `ADMIN_USERNAME` / `ADMIN_PASSWORD` until Phase 4 adds
accounts): approve, reject, correct to any ticker (OTC included), or link unmatched recipients.
Decisions are audit-logged, apply to a parent's subsidiaries, and are never overwritten by re-matching.
`/admin/ingestion` shows recent job runs and data freshness.

## Tests

```bash
pnpm test                                    # unit tests
TEST_DATABASE_URL=postgresql://… pnpm test   # + integration tests against a disposable migrated database
pnpm lint && pnpm typecheck
```

## Layout

```
prisma/            schema, migrations, seed
scripts/ingest.ts  ingestion CLI
src/app/           routes: (marketing) home + legal pages, (app) search + recipient pages
src/config/        site name, plans/pricing/feature gates, data + mapping settings
src/jobs/          job runner, USAspending loaders, rollups
src/lib/           db client, gating, search, source API clients, name normalization
tests/             unit + integration tests, fixtures
```
