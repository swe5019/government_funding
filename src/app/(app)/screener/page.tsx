import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LastUpdated } from "@/components/last-updated";
import { UpgradeNotice } from "@/components/upgrade-notice";
import { formatUsdCompact } from "@/lib/format";
import { dataWindow } from "@/lib/gating/dataCutoff";
import { getViewer } from "@/lib/gating/viewer";
import { filtersToQuery, parseScreenerFilters, type ScreenerFilters, type ScreenerSort } from "@/lib/screener/filters";
import { hasMarketCaps, runScreener, screenerOptions } from "@/lib/screener/query";

export const metadata: Metadata = {
  title: "Screener",
  description: "Screen public companies by federal award growth, size and awarding agency.",
};

export default function ScreenerPage({ searchParams }: PageProps<"/screener">) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Screener</h1>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-md bg-line" />}>
        <Screener searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const input = "w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm";
const pct = (v: number | null, digits = 0) => (v === null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(digits)}%`);

async function Screener({ searchParams }: { searchParams: PageProps<"/screener">["searchParams"] }) {
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  if (!viewer.entitlements.screener) {
    return (
      <UpgradeNotice title="The screener is part of Pro">
        Filter public companies by federal award growth, award size, awarding agency and sector.
      </UpgradeNotice>
    );
  }
  const f = parseScreenerFilters(sp);
  const win = dataWindow(viewer.entitlements);
  const [rows, options, caps] = await Promise.all([runScreener(f, win), screenerOptions(), hasMarketCaps()]);

  const sortLink = (key: ScreenerSort, label: string, align = "text-right") => {
    const dir = f.sort === key && f.dir === "desc" ? "asc" : "desc";
    const arrow = f.sort === key ? (f.dir === "desc" ? " ↓" : " ↑") : "";
    return (
      <th className={`px-4 py-2 font-medium ${align}`} aria-sort={f.sort === key ? (f.dir === "desc" ? "descending" : "ascending") : "none"}>
        <Link href={`/screener?${filtersToQuery({ ...f, sort: key, dir } as ScreenerFilters)}`} className="hover:underline">
          {label}
          {arrow}
        </Link>
      </th>
    );
  };

  return (
    <>
      <LastUpdated viewer={viewer} />
      <form action="/screener" className="grid gap-3 rounded-md border border-line bg-surface p-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <label className="space-y-1">
          <span className="block text-xs text-muted">Min awards, last 12 mo ($)</span>
          <input name="minLast12" type="number" min={0} step="any" defaultValue={f.minLast12} placeholder="e.g. 10000000" className={input} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted">Min growth vs prior 12 mo (%)</span>
          <input name="minGrowth" type="number" step="any" defaultValue={f.minGrowth} placeholder="e.g. 25" className={input} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted">Min awards / market cap (%)</span>
          <input
            name="minToMarketCap"
            type="number"
            min={0}
            step="any"
            defaultValue={f.minToMarketCap}
            disabled={!caps}
            placeholder={caps ? "e.g. 1" : "Needs price data"}
            className={input}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted">Awarding agency</span>
          <select name="agency" defaultValue={f.agency ?? ""} className={input}>
            <option value="">Any</option>
            {options.agencies.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted">Sector</span>
          <select name="sector" defaultValue={f.sector ?? ""} className={input}>
            <option value="">Any</option>
            {options.sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="sort" value={f.sort} />
        <input type="hidden" name="dir" value={f.dir} />
        <div className="flex items-end gap-2">
          <button className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90">Screen</button>
          <Link href="/screener" className="rounded-md border border-line px-3 py-1.5 hover:bg-bg">
            Reset
          </Link>
        </div>
      </form>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {rows.length} {rows.length === 1 ? "company" : "companies"} · confirmed award links only · last 12 months vs the 12 before
        </span>
        {viewer.entitlements.csvExport && (
          <a href={`/api/export/screener?${filtersToQuery(f)}`} className="text-accent hover:underline">
            Download CSV
          </a>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              {sortLink("ticker", "Company", "text-left")}
              <th className="hidden px-4 py-2 font-medium md:table-cell">Sector</th>
              {sortLink("last12", "Last 12 mo")}
              {sortLink("prior12", "Prior 12 mo")}
              {sortLink("growth", "Growth")}
              {caps && sortLink("toMarketCap", "Awards / mkt cap")}
              <th className="hidden px-4 py-2 font-medium lg:table-cell">Top agency</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-3 text-muted">
                  No companies match these filters.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.cik}>
                <td className="px-4 py-2">
                  <Link href={`/company/${encodeURIComponent(r.ticker)}`} className="hover:underline">
                    <span className="font-mono font-semibold">{r.ticker}</span> {r.name}
                  </Link>
                </td>
                <td className="hidden px-4 py-2 text-muted md:table-cell">{r.sector ?? "—"}</td>
                <td className="tabular px-4 py-2 text-right">{formatUsdCompact(r.last12)}</td>
                <td className="tabular px-4 py-2 text-right text-muted">{formatUsdCompact(r.prior12)}</td>
                <td className={`tabular px-4 py-2 text-right ${r.growth === null ? "text-muted" : r.growth >= 0 ? "text-delta-up" : "text-delta-down"}`}>
                  {pct(r.growth)}
                </td>
                {caps && <td className="tabular px-4 py-2 text-right">{r.toMarketCap === null ? "—" : `${(r.toMarketCap * 100).toFixed(2)}%`}</td>}
                <td className="hidden px-4 py-2 text-muted lg:table-cell">{r.topAgency ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!caps && (
        <p className="text-xs text-muted">
          Award size relative to market cap appears once a licensed market-data provider is connected.
        </p>
      )}
    </>
  );
}
