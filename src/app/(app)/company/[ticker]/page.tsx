import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AgencyBars } from "@/components/charts/agency-bars";
import { AwardsOverTime } from "@/components/charts/awards-over-time";
import { PriceWithAwards } from "@/components/charts/price-with-awards";
import { DataTableDetails } from "@/components/data-table-details";
import { LastUpdated } from "@/components/last-updated";
import { MatchBadge } from "@/components/match-badge";
import { SourceLink } from "@/components/source-link";
import { StatTile } from "@/components/stat-tile";
import {
  AWARD_EVENT_MIN_USD,
  getAwardEvents,
  getCategoryMix,
  getCompanyByTicker,
  getCompanyLargestAwards,
  getCompanyMonthly,
  getCompanyRecipients,
  getPriceSeries,
  getTopAgencies,
} from "@/lib/companies";
import { formatDate, formatMonth, formatUsd, formatUsdCompact } from "@/lib/format";
import { dataWindow, type DataWindow } from "@/lib/gating/dataCutoff";
import { getViewer } from "@/lib/gating/viewer";
import { getProvider } from "@/lib/market-data";
import { fillMonths, summarizePeriods } from "@/lib/periods";

export async function generateMetadata({ params }: PageProps<"/company/[ticker]">): Promise<Metadata> {
  const { ticker } = await params;
  const t = decodeURIComponent(ticker).toUpperCase();
  return {
    title: `${t} federal contracts and grants`,
    description: `Federal contracts, grants and program awards linked to ${t}, from official U.S. government records. Informational only, not investment advice.`,
  };
}

export default function CompanyPage({ params }: PageProps<"/company/[ticker]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-md bg-line" aria-busy="true" />}>
      <Company params={params} />
    </Suspense>
  );
}

const section = "space-y-2";
const h2 = "text-sm font-semibold uppercase tracking-wide text-muted";
const card = "rounded-md border border-line bg-surface p-4";

async function Company({ params }: { params: PageProps<"/company/[ticker]">["params"] }) {
  const { ticker: raw } = await params;
  const requested = decodeURIComponent(raw).toUpperCase();
  const viewer = await getViewer();
  const win = dataWindow(viewer.entitlements);
  const company = await getCompanyByTicker(requested);
  if (!company) notFound();
  if (company.ticker !== requested) redirect(`/company/${encodeURIComponent(company.ticker)}`);

  const now = new Date();
  const chartFrom = win.historyStart ?? new Date(Date.UTC(now.getUTCFullYear() - 3, now.getUTCMonth(), 1));
  const [monthly, withPossible, agencies, categories, largest, recipients] = await Promise.all([
    getCompanyMonthly(company.cik, win),
    getCompanyMonthly(company.cik, win, true),
    getTopAgencies(company.cik, win),
    getCategoryMix(company.cik, win),
    getCompanyLargestAwards(company.cik, win),
    getCompanyRecipients(company.cik, win),
  ]);
  const periods = summarizePeriods(monthly, now);
  const series = fillMonths(monthly, chartFrom, now);
  const confirmedTotal = monthly.reduce((s, m) => s + m.obligated, 0);
  const possibleExtra = withPossible.reduce((s, m) => s + m.obligated, 0) - confirmedTotal;
  const windowLabel = viewer.entitlements.historyYears ? `last ${viewer.entitlements.historyYears} years` : "all time";

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <Link href="/search" className="text-xs text-muted hover:underline">
          ← Search
        </Link>
        <h1 className="flex flex-wrap items-baseline gap-x-3 text-2xl font-semibold tracking-tight">
          <span className="font-mono">{company.ticker}</span>
          <span>{company.name}</span>
        </h1>
        <p className="text-sm text-muted">
          {[company.exchange, company.sector, company.tickers.length > 1 ? `Also ${company.tickers.slice(1).join(", ")}` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <LastUpdated viewer={viewer} />
      </header>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Headline figures">
        <StatTile label="Last 12 months" value={periods.last12} change={periods.last12Change} vsLabel="vs prior 12 months" />
        <StatTile label={`${periods.quarterLabel} to date`} value={periods.quarter} change={periods.quarterChange} vsLabel="vs same period last year" />
        <StatTile label={`Total, ${windowLabel}`} value={confirmedTotal} />
      </section>
      {possibleExtra > 0 && (
        <p className="rounded-md bg-warn-bg px-3 py-2 text-xs text-warn-fg">
          Excludes {formatUsdCompact(possibleExtra)} to recipients that are only a <strong>possible match</strong> for{" "}
          {company.ticker} (unverified links, listed below).
        </p>
      )}

      <section className={section}>
        <h2 className={h2}>Net obligations by month</h2>
        <div className={card}>
          <AwardsOverTime data={series.map((m) => ({ month: m.month.toISOString().slice(0, 7), value: m.obligated }))} />
          <p className="mt-2 text-xs text-muted">
            New awards plus modifications minus de-obligations, by action date, from recipients confirmed as {company.ticker}.
          </p>
          <DataTableDetails headers={["Month", "Net obligations"]} rows={series.map((m) => [formatMonth(m.month), formatUsd(m.obligated)])} />
        </div>
      </section>

      <Suspense fallback={<div className={`${card} h-72 animate-pulse`} />}>
        <PriceSection cik={company.cik} ticker={company.ticker} win={win} from={chartFrom} />
      </Suspense>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className={section}>
          <h2 className={h2}>Top awarding agencies, {windowLabel}</h2>
          <div className={card}>
            {agencies.length ? (
              <>
                <AgencyBars data={agencies.map((a) => ({ label: a.label, value: a.obligated }))} />
                <DataTableDetails headers={["Agency", "Net obligations"]} rows={agencies.map((a) => [a.label, formatUsd(a.obligated)])} />
              </>
            ) : (
              <p className="text-sm text-muted">No awards in this period.</p>
            )}
          </div>
        </section>
        <section className={section}>
          <h2 className={h2}>By award type</h2>
          <div className={card}>
            {categories.length ? (
              <ul className="divide-y divide-line text-sm">
                {categories.map((c) => (
                  <li key={c.key} className="flex justify-between py-2">
                    <span>{c.label}</span>
                    <span className="tabular">{formatUsdCompact(c.obligated)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No awards in this period.</p>
            )}
          </div>
        </section>
      </div>

      <section className={section}>
        <h2 className={h2}>Largest awards, last 12 months</h2>
        {largest.length === 0 ? (
          <p className="text-sm text-muted">No awards in this period.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Award</th>
                  <th className="hidden px-4 py-2 font-medium md:table-cell">Agency</th>
                  <th className="px-4 py-2 text-right font-medium">Obligation</th>
                  <th className="hidden px-4 py-2 font-medium sm:table-cell">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {largest.map((a) => (
                  <tr key={a.transactionId}>
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{formatDate(a.actionDate)}</td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{a.description ?? "—"}</div>
                      <div className="text-xs text-muted">
                        <Link href={`/recipient/${encodeURIComponent(a.recipientId)}`} className="hover:underline">
                          {a.recipientName}
                        </Link>{" "}
                        · <span className="font-mono">{a.displayId ?? a.awardId}</span>
                      </div>
                      <div className="text-xs sm:hidden">
                        <SourceLink href={a.sourceUrl} />
                      </div>
                    </td>
                    <td className="hidden px-4 py-2 text-muted md:table-cell">{a.subAgencyName ?? a.agencyName ?? "—"}</td>
                    <td className="tabular whitespace-nowrap px-4 py-2 text-right">
                      <span className="sm:hidden">{formatUsdCompact(a.obligation)}</span>
                      <span className="hidden sm:inline">{formatUsd(a.obligation)}</span>
                    </td>
                    <td className="hidden px-4 py-2 sm:table-cell">
                      <SourceLink href={a.sourceUrl} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={section}>
        <h2 className={h2}>Government award recipients linked to {company.ticker}</h2>
        <p className="text-xs text-muted">
          Awards go to legal entities. These are the entities we link to {company.name}, directly or through a parent
          company. &ldquo;Possible match&rdquo; links are unverified and not counted in the totals above.
        </p>
        <div className="overflow-x-auto rounded-md border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Recipient</th>
                <th className="px-4 py-2 font-medium">Link</th>
                <th className="px-4 py-2 text-right font-medium">Net obligations, {windowLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recipients.map((r) => (
                <tr key={r.recipientId}>
                  <td className="px-4 py-2">
                    <Link href={`/recipient/${encodeURIComponent(r.recipientId)}`} className="hover:underline">
                      {r.name}
                    </Link>
                    {r.uei && <div className="font-mono text-xs text-muted">UEI {r.uei}</div>}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">
                    <MatchBadge match={{ status: r.status, confidence: r.confidence, companyCik: company.cik }} ticker={company.ticker} />{" "}
                    {r.method === "UEI_PARENT_ROLLUP" ? "via parent company" : r.method === "MANUAL" ? "set by reviewer" : "name match"}
                  </td>
                  <td className="tabular px-4 py-2 text-right">{formatUsdCompact(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** Price chart with award markers: shown only with a configured provider; simulated data is labeled. */
async function PriceSection({ cik, ticker, win, from }: { cik: string; ticker: string; win: DataWindow; from: Date }) {
  const provider = getProvider();
  if (!provider) {
    return (
      <section className="space-y-2">
        <h2 className={h2}>Stock price and awards</h2>
        <p className={`${card} text-sm text-muted`}>
          Stock price overlay coming soon. Award history above is complete for the period shown.
        </p>
      </section>
    );
  }
  const [prices, events] = await Promise.all([getPriceSeries(cik, provider.name, from), getAwardEvents(cik, win, from)]);
  return (
    <section className="space-y-2">
      <h2 className={h2}>Stock price and awards ≥ {formatUsdCompact(AWARD_EVENT_MIN_USD)}</h2>
      {provider.isSimulated && (
        <p role="alert" className="rounded-md border-2 border-warn-fg bg-warn-bg px-3 py-2 text-sm font-semibold text-warn-fg">
          SIMULATED PRICES — not real market data. Development preview only.
        </p>
      )}
      <div className={card}>
        {prices.length ? (
          <>
            <PriceWithAwards prices={prices} awards={events} ticker={ticker} />
            <p className="mt-2 text-xs text-muted">
              Award markers sit on the first trading day on or after the award&rsquo;s action date. Awards are often announced
              before or after that date; this chart shows timing, not cause and effect.
            </p>
            <DataTableDetails
              summary="Show marked awards"
              headers={["Date · recipient", "Obligation"]}
              rows={events.map((e) => [`${e.date} · ${e.recipientName}`, formatUsd(e.obligation)])}
            />
          </>
        ) : (
          <p className="text-sm text-muted">No price data yet for {ticker}.</p>
        )}
      </div>
    </section>
  );
}
