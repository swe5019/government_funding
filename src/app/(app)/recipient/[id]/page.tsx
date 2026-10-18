import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LastUpdated } from "@/components/last-updated";
import { MatchBadge } from "@/components/match-badge";
import { SourceLink } from "@/components/source-link";
import { formatDate, formatMonth, formatUsd, formatUsdCompact, recipientTypeLabel } from "@/lib/format";
import { dataWindow } from "@/lib/gating/dataCutoff";
import { getViewer } from "@/lib/gating/viewer";
import { matchDisplay } from "@/lib/mapping/display";
import { getLargestRecentAwards, getRecipient, getRecipientMonthly } from "@/lib/recipients";

export default function RecipientPage({ params }: PageProps<"/recipient/[id]">) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-md bg-line" aria-busy="true" />}>
      <RecipientDetail params={params} />
    </Suspense>
  );
}

async function RecipientDetail({ params }: { params: PageProps<"/recipient/[id]">["params"] }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const viewer = await getViewer();
  const win = dataWindow(viewer.entitlements);
  const recipient = await getRecipient(id);
  if (!recipient) notFound();

  const [monthly, largest] = await Promise.all([getRecipientMonthly(id, win), getLargestRecentAwards(id, win)]);
  const total = monthly.reduce((s, m) => s + Number(m.obligated), 0);
  const recent = [...monthly].reverse().slice(0, 24);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Link href="/search" className="text-xs text-muted hover:underline">
          ← Search
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{recipient.name}</h1>
        <p className="text-sm text-muted">
          {recipientTypeLabel(recipient.recipientType)}
          {recipient.uei && <> · UEI <span className="font-mono">{recipient.uei}</span></>}
          {recipient.parentName && recipient.parentName !== recipient.name && <> · Parent: {recipient.parentName}</>}
          {recipient.stateCode && <> · {recipient.stateCode}</>}
        </p>
        <LinkedCompany match={recipient.tickerMatch} />
        <LastUpdated viewer={viewer} />
      </div>

      <section className="rounded-md border border-line bg-surface p-4">
        <div className="text-xs uppercase tracking-wide text-muted">
          Net obligations{" "}
          {viewer.entitlements.historyYears ? `· last ${viewer.entitlements.historyYears} years` : "· all time"}
        </div>
        <div className="tabular text-3xl font-semibold">{formatUsdCompact(total)}</div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Largest awards, last 12 months</h2>
        {largest.length === 0 ? (
          <p className="text-sm text-muted">No awards in this period.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Award</th>
                  <th className="px-4 py-2 font-medium">Agency</th>
                  <th className="px-4 py-2 text-right font-medium">Obligation</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {largest.map((a) => (
                  <tr key={a.transactionId}>
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{formatDate(a.actionDate)}</td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{a.description ?? "—"}</div>
                      <div className="font-mono text-xs text-muted">{a.displayId ?? a.awardId}</div>
                    </td>
                    <td className="px-4 py-2 text-muted">{a.subAgencyName ?? a.agencyName ?? "—"}</td>
                    <td className="tabular whitespace-nowrap px-4 py-2 text-right">{formatUsd(a.obligation)}</td>
                    <td className="px-4 py-2">
                      <SourceLink href={a.sourceUrl} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">By month</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted">No obligations in this period.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Month</th>
                  <th className="px-4 py-2 text-right font-medium">Net obligations</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recent.map((m) => (
                  <tr key={m.month.toISOString()}>
                    <td className="px-4 py-2">{formatMonth(m.month)}</td>
                    <td className="tabular px-4 py-2 text-right">{formatUsd(m.obligated)}</td>
                    <td className="tabular px-4 py-2 text-right text-muted">{m.txCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

type RecipientWithMatch = NonNullable<Awaited<ReturnType<typeof getRecipient>>>;

function LinkedCompany({ match }: { match: RecipientWithMatch["tickerMatch"] }) {
  const display = matchDisplay(match);
  if (!match?.company || display === "hidden") return null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Linked public company:</span>
      <MatchBadge match={match} ticker={match.company.ticker} />
      <span>{match.company.name}</span>
      {match.method === "UEI_PARENT_ROLLUP" && <span className="text-xs text-muted">(via parent company)</span>}
    </p>
  );
}
