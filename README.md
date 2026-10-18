# FedFlow

Tracks which publicly traded companies receive U.S. federal money (contracts, grants, program funding) and
how that relates to their stock. "FedFlow" is a placeholder name, set once in `src/config/site.ts`.

**Informational only. Not investment advice.**

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Schema, USAspending ingestion (3-year backfill + daily), basic search | ✅ built |
| 2 | Recipient → ticker mapping + admin review | next |
| 3 | Company and program pages with charts | |
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
pnpm dev                          # http://localhost:3000/search?q=lockheed
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
