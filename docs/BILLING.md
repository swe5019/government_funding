# Billing setup (Stripe)

Plans, displayed prices, trial length and feature gates live in `src/config/plans.ts`. Stripe holds the
actual prices; the app finds them through the env vars named in `plans.ts` (`stripePriceIdEnv`).

## One-time setup (do it in test mode first, then repeat in live mode)

1. **Product and prices.** Stripe Dashboard → Product catalog → add product "Pro" with two recurring
   prices: monthly ($19) and yearly ($190). Copy the price IDs (`price_...`) into
   `STRIPE_PRICE_PRO_MONTHLY` and `STRIPE_PRICE_PRO_ANNUAL`.
2. **API key.** Developers → API keys → secret key → `STRIPE_SECRET_KEY` (use a restricted key in
   production with write access to Customers, Checkout Sessions, Customer Portal and read access to
   Subscriptions).
3. **Customer Portal.** Settings → Billing → Customer portal: enable it; allow cancelling (at period end),
   updating payment methods, and switching between the monthly and yearly prices.
4. **Webhook.** Developers → Webhooks → add endpoint `https://<your-domain>/api/stripe/webhook` with events:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `customer.subscription.trial_will_end`. Copy the signing secret into
   `STRIPE_WEBHOOK_SECRET`.
5. **Trial emails / dunning.** Settings → Billing → Subscriptions and emails: turn on the trial-ending
   reminder and failed-payment retries. The app keeps Pro access while a subscription is `past_due` and
   drops it when Stripe cancels.

## How it works

- `/pricing` → Stripe Checkout (subscription mode). First-time subscribers get the 7-day trial
  (`plans.pro.trialDays`); a card is always collected and billing starts automatically after the trial.
  Users who already had a trial subscribe without one.
- The webhook verifies the signature, re-fetches the subscription from Stripe (so out-of-order events can't
  leave stale state), upserts the `Subscription` row and records the event id in `StripeEvent` (replays are
  no-ops). It returns an error, so Stripe retries, if the database write fails.
- Access: `trialing`, `active` and `past_due` subscriptions get Pro (until the period end, plus a 1-day grace
  for late webhooks); anything else is Free (`src/lib/billing/entitlements.ts`).

## Local testing

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook   # prints a whsec_... secret for .env
pnpm dev
# visit /pricing, use test card 4242 4242 4242 4242
stripe trigger customer.subscription.updated                    # optional: extra events
```

## Changing prices

Create a new price in Stripe (prices are immutable), update the price-ID env var and the display amount in
`src/config/plans.ts`, and redeploy. Existing subscribers stay on their old price until you migrate them in
Stripe, so add the old price IDs to `STRIPE_PRICE_PRO_LEGACY` (comma-separated). Without that, webhook
events for those subscriptions fail with "unknown price" and Stripe keeps retrying them.
