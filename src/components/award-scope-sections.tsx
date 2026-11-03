import Link from "next/link";
import type { ReactNode } from "react";
import { AwardsOverTime } from "@/components/charts/awards-over-time";
import { DataTableDetails } from "@/components/data-table-details";
import { MatchBadge } from "@/components/match-badge";
import { SourceLink } from "@/components/source-link";
import { StatTile } from "@/components/stat-tile";
import { formatDate, formatMonth, formatUsd, formatUsdCompact } from "@/lib/format";
import type { DataWindow } from "@/lib/gating/dataCutoff";
import { fillMonths } from "@/lib/periods";
import {
  getProgramCompanies,
  getProgramLargestAwards,
  getProgramSummary,
  type AwardScope,
  type ProgramCompany,
} from "@/lib/programs/queries";

const h2 = "text-sm font-semibold uppercase tracking-wide text-muted";

/**
 * The data sections shared by program, theme and grant-program pages: headline totals, public
 * company recipients, monthly chart, then `beforeLargest` (announcements, notices), then the
 * largest awards. Every figure applies the viewer's data window.
 */
export async function AwardScopeSections({ scope, win, beforeLargest }: { scope: AwardScope; win: DataWindow; beforeLargest?: ReactNode }) {
  const [summary, companies, largest] = await Promise.all([
    getProgramSummary(scope, win),
    getProgramCompanies(scope, win),
    getProgramLargestAwards(scope, win),
  ]);
  const now = new Date();
  const first = summary.monthly[0]?.month ?? win.historyStart ?? now;
  const series = fillMonths(summary.monthly, first, now);
  const publicShare = summary.total > 0 ? summary.publicTotal / summary.total : 0;

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Headline figures">
        <StatTile label="Total obligated" value={summary.total} />
        <StatTile label="To public companies (confirmed)" value={summary.publicTotal} />
        <div className="rounded-md border border-line bg-surface p-4">
          <div className="text-xs text-muted">Share to public companies</div>
          <div className="mt-1 text-2xl font-semibold">{Math.round(publicShare * 100)}%</div>
          <div className="mt-1 text-xs text-muted">
            {summary.awardCount} {summary.awardCount === 1 ? "award" : "awards"} · {summary.recipientCount}{" "}
            {summary.recipientCount === 1 ? "recipient" : "recipients"}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className={h2}>Public companies receiving funds</h2>
        <CompanyTable rows={companies.confirmed} total={summary.total} />
        {companies.possible.length > 0 && (
          <div className="space-y-2 pt-2">
            <h3 className="text-sm font-medium text-warn-fg">Possible matches (unverified)</h3>
            <p className="text-xs text-muted">
              These recipients might belong to the listed companies, but the link is below our confidence threshold. They are
              not included in the public-company totals.
            </p>
            <CompanyTable rows={companies.possible} total={summary.total} possible />
          </div>
        )}
      </section>

      {summary.awardCount > 0 && series.length > 1 && (
        <section className="space-y-2">
          <h2 className={h2}>Obligations by month</h2>
          <div className="rounded-md border border-line bg-surface p-4">
            <AwardsOverTime data={series.map((m) => ({ month: m.month.toISOString().slice(0, 7), value: m.obligated }))} />
            <DataTableDetails headers={["Month", "Net obligations"]} rows={series.map((m) => [formatMonth(m.month), formatUsd(m.obligated)])} />
          </div>
        </section>
      )}

      {beforeLargest}

      <section className="space-y-2">
        <h2 className={h2}>Largest awards</h2>
        {largest.length === 0 ? (
          <p className="text-sm text-muted">No awards in this program for the period shown yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Recipient</th>
                  <th className="px-4 py-2 text-right font-medium">Obligation</th>
                  <th className="hidden px-4 py-2 font-medium sm:table-cell">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {largest.map((a) => (
                  <tr key={a.transactionId}>
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{formatDate(a.actionDate)}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {a.recipientId ? (
                          <Link href={`/recipient/${encodeURIComponent(a.recipientId)}`} className="font-medium hover:underline">
                            {a.recipientName}
                          </Link>
                        ) : (
                          <span>{a.recipientName ?? "—"}</span>
                        )}
                        <MatchBadge
                          link
                          ticker={a.ticker}
                          match={a.matchStatus ? { status: a.matchStatus, confidence: a.matchConfidence ?? 0, companyCik: a.matchCik } : null}
                        />
                      </div>
                      <div className="text-xs text-muted">{a.description}</div>
                      <div className="text-xs sm:hidden">
                        <SourceLink href={a.sourceUrl} />
                      </div>
                    </td>
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
    </>
  );
}

function CompanyTable({ rows, total, possible = false }: { rows: ProgramCompany[]; total: number; possible?: boolean }) {
  if (!rows.length) return <p className="text-sm text-muted">No public company recipients yet.</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-xs text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">Company</th>
            <th className="px-4 py-2 text-right font-medium">Obligated</th>
            <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Share of program</th>
            <th className="hidden px-4 py-2 font-medium sm:table-cell">Latest award</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((c) => (
            <tr key={c.cik}>
              <td className="px-4 py-2">
                <Link href={`/company/${encodeURIComponent(c.ticker)}`} className="hover:underline">
                  {possible ? (
                    <MatchBadge match={{ status: "PENDING", confidence: 0, companyCik: c.cik }} ticker={c.ticker} />
                  ) : (
                    <span className="font-mono font-semibold">{c.ticker}</span>
                  )}{" "}
                  {c.name}
                </Link>
              </td>
              <td className="tabular px-4 py-2 text-right">{formatUsdCompact(c.total)}</td>
              <td className="tabular hidden px-4 py-2 text-right sm:table-cell">
                {total > 0 ? `${((c.total / total) * 100).toFixed(1)}%` : "—"}
              </td>
              <td className="hidden px-4 py-2 text-muted sm:table-cell">{formatDate(c.latestAction)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
