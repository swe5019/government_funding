import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AwardsOverTime } from "@/components/charts/awards-over-time";
import { DataTableDetails } from "@/components/data-table-details";
import { LastUpdated } from "@/components/last-updated";
import { MatchBadge } from "@/components/match-badge";
import { SourceLink } from "@/components/source-link";
import { StatTile } from "@/components/stat-tile";
import { getProgramDocuments } from "@/lib/announcements";
import { formatDate, formatMonth, formatUsd, formatUsdCompact } from "@/lib/format";
import { dataWindow } from "@/lib/gating/dataCutoff";
import { getViewer } from "@/lib/gating/viewer";
import { fillMonths } from "@/lib/periods";
import { getProgram, getProgramCompanies, getProgramLargestAwards, getProgramSummary, type ProgramCompany } from "@/lib/programs/queries";

export async function generateMetadata({ params }: PageProps<"/program/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const program = await getProgram(slug);
  return {
    title: program ? `${program.name}: public company recipients` : "Program",
    description: program?.description ?? undefined,
    alternates: { canonical: `/program/${slug}` },
  };
}

export default function ProgramPage({ params }: PageProps<"/program/[slug]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-md bg-line" aria-busy="true" />}>
      <Program params={params} />
    </Suspense>
  );
}

const h2 = "text-sm font-semibold uppercase tracking-wide text-muted";

async function Program({ params }: { params: PageProps<"/program/[slug]">["params"] }) {
  const { slug } = await params;
  const program = await getProgram(slug);
  if (!program) notFound();
  const viewer = await getViewer();
  const win = dataWindow(viewer.entitlements);
  const [summary, companies, largest, documents] = await Promise.all([
    getProgramSummary(slug, win),
    getProgramCompanies(slug, win),
    getProgramLargestAwards(slug, win),
    getProgramDocuments(slug),
  ]);
  const now = new Date();
  const first = summary.monthly[0]?.month ?? win.historyStart ?? now;
  const series = fillMonths(summary.monthly, first, now);
  const publicShare = summary.total > 0 ? summary.publicTotal / summary.total : 0;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <Link href="/programs" className="text-xs text-muted hover:underline">
          ← Programs
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{program.name}</h1>
        <p className="max-w-3xl text-sm text-muted">{program.description}</p>
        {program.sourceUrl && (
          <p className="text-sm">
            Official program information: <SourceLink href={program.sourceUrl} label={new URL(program.sourceUrl).hostname} />
          </p>
        )}
        <LastUpdated viewer={viewer} />
      </header>

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

      {series.length > 1 && (
        <section className="space-y-2">
          <h2 className={h2}>Obligations by month</h2>
          <div className="rounded-md border border-line bg-surface p-4">
            <AwardsOverTime data={series.map((m) => ({ month: m.month.toISOString().slice(0, 7), value: m.obligated }))} />
            <DataTableDetails headers={["Month", "Net obligations"]} rows={series.map((m) => [formatMonth(m.month), formatUsd(m.obligated)])} />
          </div>
        </section>
      )}

      {documents.length > 0 && (
        <section className="space-y-2">
          <h2 className={h2}>Federal Register rules and notices</h2>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface text-sm">
            {documents.map((d) => (
              <li key={d.documentNumber} className="space-y-0.5 px-4 py-3">
                <div className="text-xs text-muted">
                  {formatDate(d.publishedAt)} · {d.type}
                  {d.agencyNames.length > 0 && <> · {d.agencyNames.join(", ")}</>}
                </div>
                <div className="font-medium">{d.title}</div>
                {d.abstract && <p className="line-clamp-2 text-xs text-muted">{d.abstract}</p>}
                <SourceLink href={d.url} label="federalregister.gov" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className={h2}>Largest awards</h2>
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
      </section>
    </div>
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
