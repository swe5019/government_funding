import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { JsonLd } from "@/components/json-ld";
import { LastUpdated } from "@/components/last-updated";
import { UpgradeNotice } from "@/components/upgrade-notice";
import { siteConfig } from "@/config/site";
import { displayCompanyName, formatUsdCompact } from "@/lib/format";
import { getViewer } from "@/lib/gating/viewer";
import { getTopContractors } from "@/lib/rankings";

const LIMIT = 100;
const title = "Top government contractors: public companies ranked by federal awards";
const description =
  "The 100 publicly traded companies receiving the most U.S. federal contract and grant money over the last 12 months, by stock ticker, with change vs the prior year and the top awarding agency. From official USAspending.gov records.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/top-government-contractors" },
  openGraph: { title, description, url: "/top-government-contractors" },
};

export default function TopContractorsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Top government contractors among public companies</h1>
        <p className="max-w-3xl text-sm text-muted">
          Publicly traded companies ranked by the federal contract and grant money obligated to them over the last 12
          months. Totals are net (new awards and modifications minus de-obligations) and come from official
          USAspending.gov records, linked to stock tickers. Click a company for every award, agency and program.
        </p>
      </header>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-md bg-line" aria-busy="true" />}>
        <Rankings />
      </Suspense>
    </div>
  );
}

const pct = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(0)}%`);

async function Rankings() {
  await connection();
  const [viewer, rows] = await Promise.all([getViewer(), getTopContractors(LIMIT)]);
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: title,
          itemListOrder: "https://schema.org/ItemListOrderDescending",
          numberOfItems: rows.length,
          itemListElement: rows.map((r, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: `${displayCompanyName(r.name)} (${r.ticker})`,
            url: `${siteConfig.url}/company/${encodeURIComponent(r.ticker)}`,
          })),
        }}
      />
      <LastUpdated viewer={viewer} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No award data loaded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 text-right font-medium">Last 12 months</th>
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">vs prior year</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Top agency</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.cik} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-muted">{i + 1}</td>
                  <td className="px-3 py-2">
                    <Link href={`/company/${encodeURIComponent(r.ticker)}`} className="hover:underline">
                      <span className="font-mono font-medium">{r.ticker}</span> <span>{displayCompanyName(r.name)}</span>
                    </Link>
                    {r.sector && <div className="text-xs text-muted">{r.sector}</div>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUsdCompact(r.last12)}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{pct(r.growth)}</td>
                  <td className="hidden px-3 py-2 md:table-cell">{r.topAgency ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!viewer.entitlements.screener && (
        <UpgradeNotice title="Filter, sort and get alerts" source="rankings">
          Pro adds a screener (award growth, award size vs market cap, agency, sector), daily data instead of a 7-day
          delay, and email alerts when a company you follow wins a new award.
        </UpgradeNotice>
      )}
      <p className="text-xs text-muted">
        Browse by sector on the <Link href="/programs" className="underline">programs and sectors</Link> page.
      </p>
    </>
  );
}
