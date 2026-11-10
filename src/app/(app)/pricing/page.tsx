import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { plans, type Entitlements } from "@/config/plans";
import { DISCLAIMER } from "@/config/site";
import { billingConfigured } from "@/lib/billing/stripe";
import { getViewer } from "@/lib/gating/viewer";
import { PRICE_ANSWERS } from "@/lib/waitlist";
import { joinWaitlistAction, startCheckoutAction } from "./actions";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Free and Pro plans for tracking federal awards to public companies.",
};

const FEATURES: { key: keyof Entitlements | "search"; label: string }[] = [
  { key: "search", label: "Search, company and program pages" },
  { key: "dataDelayDays", label: "Data freshness" },
  { key: "historyYears", label: "Award history" },
  { key: "watchlists", label: "Watchlists" },
  { key: "emailAlerts", label: "Email alerts for new awards" },
  { key: "largeAwardsFeed", label: "Daily large-awards feed" },
  { key: "screener", label: "Screener" },
  { key: "csvExport", label: "CSV export" },
];

function featureValue(e: Entitlements, key: (typeof FEATURES)[number]["key"]): string {
  if (key === "search") return "✓";
  if (key === "dataDelayDays") return e.dataDelayDays ? `${e.dataDelayDays}-day delay` : "Updated daily";
  if (key === "historyYears") return e.historyYears ? `Last ${e.historyYears} years` : "Full history";
  return e[key] ? "✓" : "—";
}

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

export default function PricingPage({ searchParams }: PageProps<"/pricing">) {
  const pro = plans.pro;
  const monthly = pro.prices.monthly!.amountUsd;
  const annual = pro.prices.annual!.amountUsd;
  const savings = Math.round((1 - annual / (monthly * 12)) * 100);
  // Until paid plans go on sale, Pro takes waitlist sign-ups (and a price question) instead.
  const onSale = billingConfigured();

  return (
    <div className="space-y-8">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-muted">
          {onSale ? <>Start with {pro.trialDays} days of Pro free. Cancel anytime.</> : <>Pro is coming soon. Join the waitlist to get early access.</>}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-md border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold">{plans.free.name}</h2>
          <p className="mt-1 text-sm text-muted">{plans.free.description}</p>
          <p className="mt-4 text-3xl font-semibold">$0</p>
          <Link href="/search" className="mt-6 inline-block rounded-md border border-line px-4 py-2 text-sm hover:bg-bg">
            Start searching
          </Link>
        </section>

        <section className="rounded-md border-2 border-accent bg-surface p-6">
          <h2 className="text-lg font-semibold">{pro.name}</h2>
          <p className="mt-1 text-sm text-muted">{pro.description}</p>
          <p className="mt-4">
            <span className="text-3xl font-semibold">{usd(monthly)}</span>
            <span className="text-muted">/month</span>
            <span className="ml-3 text-sm text-muted">
              or {usd(annual)}/year{savings > 0 && ` (save ${savings}%)`}
            </span>
          </p>
          <Suspense fallback={<div className="mt-6 h-10 animate-pulse rounded-md bg-line" />}>
            <ProActions searchParams={searchParams} />
          </Suspense>
          {onSale && (
            <p className="mt-3 text-xs text-muted">
              {pro.trialDays}-day free trial for new subscribers, then {usd(monthly)}/month or {usd(annual)}/year. A card is
              required; you won&rsquo;t be charged if you cancel before the trial ends.
            </p>
          )}
        </section>
      </div>

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Feature</th>
              <th className="px-4 py-2 font-medium">{plans.free.name}</th>
              <th className="px-4 py-2 font-medium">{pro.name}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {FEATURES.map((f) => (
              <tr key={f.key}>
                <td className="px-4 py-2">{f.label}</td>
                <td className="px-4 py-2 text-muted">{featureValue(plans.free.entitlements, f.key)}</td>
                <td className="px-4 py-2">{featureValue(pro.entitlements, f.key)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">{DISCLAIMER}</p>
    </div>
  );
}

async function ProActions({ searchParams }: { searchParams: PageProps<"/pricing">["searchParams"] }) {
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  const btn = "rounded-md px-4 py-2 text-sm font-medium";
  if (viewer.plan !== "free") {
    return (
      <Link href="/account" className={`mt-6 inline-block bg-accent text-white ${btn}`}>
        You&rsquo;re on Pro — manage your plan
      </Link>
    );
  }
  if (!billingConfigured()) return <WaitlistForm viewerEmail={viewer.user?.email ?? null} sp={sp} />;
  const label = viewer.user?.trialUsedAt ? "Subscribe" : `Start ${plans.pro.trialDays}-day free trial`;
  return (
    <div className="mt-6 space-y-2">
      {sp.checkout === "cancelled" && <p className="text-xs text-muted">Checkout cancelled. No charge was made.</p>}
      <div className="flex flex-wrap gap-2">
        <form action={startCheckoutAction}>
          <input type="hidden" name="interval" value="monthly" />
          <button className={`bg-accent text-white hover:opacity-90 ${btn}`}>{label} · monthly</button>
        </form>
        <form action={startCheckoutAction}>
          <input type="hidden" name="interval" value="annual" />
          <button className={`border border-accent text-accent hover:bg-bg ${btn}`}>{label} · annual</button>
        </form>
      </div>
    </div>
  );
}

function WaitlistForm({ viewerEmail, sp }: { viewerEmail: string | null; sp: Awaited<PageProps<"/pricing">["searchParams"]> }) {
  if (sp.waitlist === "joined") {
    return (
      <p id="waitlist" role="status" className="mt-6 rounded-md bg-accent/10 px-3 py-2 text-sm">
        You&rsquo;re on the Pro waitlist. We&rsquo;ll email you when it opens, with an early-access offer.
      </p>
    );
  }
  const from = typeof sp.from === "string" ? sp.from : "pricing";
  return (
    <form id="waitlist" action={joinWaitlistAction} className="mt-6 space-y-3 text-sm">
      {sp.waitlist === "invalid" && <p className="text-warn-fg">Please enter a valid email address.</p>}
      <input type="hidden" name="source" value={from} />
      <div aria-hidden="true" className="hidden">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {viewerEmail ? (
        <p className="text-muted">Joining as {viewerEmail}</p>
      ) : (
        <label className="block space-y-1">
          <span className="text-xs text-muted">Email</span>
          <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="w-full rounded-md border border-line bg-surface px-2 py-1.5" />
        </label>
      )}
      <fieldset className="space-y-1">
        <legend className="text-xs text-muted">Optional: what would Pro be worth to you per month?</legend>
        {PRICE_ANSWERS.map((p) => (
          <label key={p.value} className="flex items-center gap-2">
            <input type="radio" name="price" value={p.value} /> {p.label}
          </label>
        ))}
      </fieldset>
      <button className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:opacity-90">Join the Pro waitlist</button>
      <p className="text-xs text-muted">We&rsquo;ll only email you about Pro. No payment needed.</p>
    </form>
  );
}
