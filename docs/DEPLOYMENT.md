# Deployment

Production layout:

| Piece | Runs on | Why |
|---|---|---|
| Web app (pages, API routes, Stripe webhook) | Vercel | Next.js host; preview deploys per branch |
| Database | Neon Postgres 16 | Serverless Postgres with a pooler and branching |
| Ingestion jobs | GitHub Actions (`.github/workflows/ingest.yml`) | Bulk downloads run minutes to hours, longer than serverless functions allow |
| Email (magic links, alerts) | Resend | |
| Billing | Stripe | See [BILLING.md](BILLING.md) |
| Errors | Sentry (optional) | Off unless a DSN is set |

Go through the steps in order. Each one says what to copy where.

## 1. Neon

1. Create a project (Postgres 16, region close to your Vercel region, e.g. `us-east-1`/`iad1`).
2. Create a database `fedflow`. In **Connection details** copy two strings:
   - **Pooled** (host contains `-pooler`) → `DATABASE_URL`. The app uses it.
   - **Direct** (toggle "Connection pooling" off) → `DIRECT_URL`. Migrations and ingestion use it; the
     jobs' advisory locks don't work through the pooler.
   Both need `?sslmode=require`.
3. Apply migrations once from your machine:
   ```bash
   DIRECT_URL="<direct string>" pnpm db:migrate
   DIRECT_URL="<direct string>" DATABASE_URL="<direct string>" pnpm db:seed
   ```
   The first migration runs `CREATE EXTENSION pg_trgm` (Neon allows it; no extra setup).
4. Sizing: a 3-year backfill of every contract and assistance transaction is tens of GB with indexes.
   Load one month first (`usaspending-backfill --month YYYY-MM`), check the size in the Neon console, and
   extrapolate before choosing a plan. Raise autoscaling (2+ CU) while the backfill runs.
5. Backups: Neon keeps point-in-time history for your plan's retention window. Before risky operations
   (big migrations, a full re-match) create a branch, which is an instant copy. For an independent copy,
   schedule `pg_dump --format=custom "$DIRECT_URL"` to your own storage.

## 2. Resend

1. Add and verify your sending domain (DNS: SPF, DKIM; add DMARC too).
2. Create an API key with "Sending access" → `RESEND_API_KEY`.
3. `EMAIL_FROM="FedFlow <no-reply@yourdomain.com>"`, on the verified domain.

## 3. Google sign-in (optional)

Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web):
- Authorized redirect URI: `https://yourdomain.com/api/auth/callback/google`
  (add the Vercel preview URL too if you want it there).
- Publish the consent screen (it stays in "testing" otherwise and only listed users can sign in).
- Copy the client ID and secret to `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`. Without them the Google button is hidden.

## 4. Stripe

Follow [BILLING.md](BILLING.md): products and prices, Customer Portal, the webhook endpoint
`https://yourdomain.com/api/stripe/webhook`. Do it in test mode first, then repeat in live mode and swap
the live keys and price IDs into the Production environment only.

## 5. Sentry (optional)

1. Create a Next.js project. Copy its DSN to both `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`.
2. For readable stack traces, create an auth token with "project:releases" and "org:read" scopes and set
   `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (build time only; source maps are uploaded and
   not served publicly).
3. Set an alert rule for new issues, and one on the `component:ingest` tag so failed jobs page you.

What gets sent: server errors (`onRequestError`), client errors and route-change performance samples
(5% by default, `SENTRY_TRACES_SAMPLE_RATE`), and ingestion job failures. User identity, cookies, auth
headers, request bodies and query strings are stripped before sending (`src/lib/monitoring/scrub.ts`).
Mention Sentry as a processor in your privacy policy if you enable it.

## 6. Vercel

1. Import the GitHub repository. Framework: Next.js. Node 22.
2. **Build command:** `pnpm db:migrate && pnpm build` for Production, so migrations apply before the new
   code goes live. Preview deploys should not migrate the production database: either give Preview its
   own Neon branch (Neon's Vercel integration does this automatically) or leave `DIRECT_URL` unset for
   Preview and use plain `pnpm build`.
   Migrations are written to be backward compatible with the previous release (add, backfill, then
   remove in a later release) because the old version keeps serving during the build.
3. Environment variables (Production; repeat with test values for Preview):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon pooled string |
   | `DIRECT_URL` | Neon direct string (migrations at build) |
   | `NEXT_PUBLIC_APP_URL` | `https://yourdomain.com` (canonical URLs, sitemap, emails, Stripe return URLs) |
   | `AUTH_URL` | `https://yourdomain.com` |
   | `AUTH_SECRET` | `openssl rand -base64 32` |
   | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | optional |
   | `RESEND_API_KEY`, `EMAIL_FROM` | from step 2 |
   | `ADMIN_EMAILS` | comma-separated admin emails |
   | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | live values in Production |
   | `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL` | live price IDs |
   | `SEC_USER_AGENT` | `"FedFlow you@yourdomain.com"` |
   | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ENVIRONMENT=production` | optional |
   | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | optional, build only |
   | `MARKET_DATA_PROVIDER`, `MARKET_DATA_API_KEY` | leave unset until a licensed provider is chosen; `mock` is ignored in production |

   `NEXT_PUBLIC_*` values are baked in at build time: redeploy after changing them.
4. Domain: add it in Vercel → Domains, then update `NEXT_PUBLIC_APP_URL`, `AUTH_URL`, the Google redirect
   URI and the Stripe webhook URL if they changed. The app sends HSTS with `preload`; only submit the
   domain to the preload list once HTTPS works on every subdomain.

## 7. GitHub Actions

Repository → Settings → Secrets and variables → Actions.

Secrets:

| Secret | Used by |
|---|---|
| `DIRECT_URL` | ingest (Neon **direct** string) |
| `SEC_USER_AGENT` | ingest (EDGAR) |
| `SAM_API_KEY` | ingest (parents, award notices), optional |
| `RESEND_API_KEY` | ingest (watchlist alert emails) |
| `SENTRY_DSN` | ingest failures, optional |
| `MARKET_DATA_API_KEY` | prices, when a provider is chosen |

Variables: `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL` (links in alert emails), `MARKET_DATA_PROVIDER`.

The CI workflow (`ci.yml`) needs nothing: lint, typecheck, unit + integration tests, build, and
Playwright E2E run against throwaway Postgres service containers.

## 8. First data load (runbook)

Run from Actions → Ingest → "Run workflow" (or locally with the direct URL):

1. `usaspending-agencies`
2. `edgar-companies` (the first run makes one SEC request per company for former names; it is
   throttled under SEC's limit, so it takes a while; use `--limit` to spread it over several runs)
3. `usaspending-backfill`: 36 months × 2 file types. Hosted runners stop at 6 h; the job is resumable,
   so re-run it until the log says every month is loaded. Expect several runs. Runs queue one at a
   time (workflow `concurrency: ingest`).
4. `match-tickers` with `--full`, then review `/admin/matches` (start with the largest recipients).
5. `tag-programs`, `edgar-filings`, `federal-register`.
6. Enable the schedule (it is on by default in `ingest.yml`: daily 09:17 UTC, weekly SEC refresh Sundays).

Check `/admin/ingestion` after each step: every chunk is logged with row counts and errors.

## 9. Monitoring

- **Health endpoint:** `GET /api/health` returns 200 `{"status":"ok"}`, or 503 when the database is
  unreachable (`down`) or USAspending data is more than 36 hours old (`degraded`). Point an uptime
  monitor (Better Stack, UptimeRobot, Checkly) at it every 5 minutes and alert on non-200.
- **Job failures:** the Ingest workflow fails visibly in Actions (enable email notifications for failed
  workflows) and reports to Sentry with the `component:ingest` tag.
- **Stripe:** Dashboard → Developers → Webhooks shows failed deliveries; Stripe retries for 3 days.

## 10. SEO

- `robots.txt` and `sitemap.xml` are generated (`src/app/robots.ts`, `src/app/sitemap.ts`). The sitemap
  reads the database per request and lists the static pages, programs, and companies with a confirmed
  link. Submit `https://yourdomain.com/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
- Company and program pages set canonical URLs; company pages include `Dataset` structured data.
- Account, admin, watchlist and sign-in pages are disallowed in robots.txt and/or marked `noindex`.
- With streaming, pages that resolve to "not found" after the shell is sent return HTTP 200 with
  `<meta name="robots" content="noindex">`, so they don't get indexed.

## Release checklist

- [ ] CI green on `main` (including E2E).
- [ ] Stripe in live mode: prices, portal, webhook secret; one real purchase and refund tested.
- [ ] Resend domain verified; magic-link email arrives (check spam placement).
- [ ] `ADMIN_EMAILS` set; admin pages reachable only for those accounts.
- [ ] Privacy policy and terms replaced with lawyer-reviewed text (current pages are placeholders).
- [ ] Health monitor and Sentry alerts on.
- [ ] Each Phase 6 source smoke-run once live (`pnpm ingest dod-announcements`, `sam-opportunities`,
      `federal-register`, `edgar-filings --limit 5`), since they were built against saved fixtures.
