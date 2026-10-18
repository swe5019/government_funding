import { SourceLink } from "@/components/source-link";
import type { Announcement } from "@/lib/announcements";
import { formatDate, formatUsdCompact } from "@/lib/format";

const h2 = "text-sm font-semibold uppercase tracking-wide text-muted";

/** DoD / SAM.gov announcements: arrive before USAspending, amounts as announced (often include options). */
export function AnnouncementsList({ items, showCompany = false }: { items: Announcement[]; showCompany?: boolean }) {
  return (
    <ul className="divide-y divide-line rounded-md border border-line bg-surface">
      {items.map((a) => (
        <li key={`${a.source}-${a.id}`} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="text-xs text-muted">
              <span className="rounded border border-line px-1.5 py-0.5 font-medium text-fg">{a.source}</span> {formatDate(a.date)}
              {showCompany && (
                <>
                  {" "}
                  · <span className="font-mono font-semibold text-fg">{a.ticker}</span> {a.companyName}
                </>
              )}
            </div>
            <div className="line-clamp-3">{a.title}</div>
            <div className="text-xs text-muted">
              {a.recipientName}
              {a.agency && <> · {a.agency}</>}
              {a.contractNumber && <> · <span className="font-mono">{a.contractNumber}</span></>} · <SourceLink href={a.url} label={a.source === "DoD" ? "defense.gov" : "SAM.gov"} />
            </div>
          </div>
          {a.amount && <div className="tabular whitespace-nowrap text-right font-semibold">{formatUsdCompact(a.amount)}</div>}
        </li>
      ))}
    </ul>
  );
}

export function EarlySignalsSection({
  announcements,
  filings,
  ticker,
}: {
  announcements: Announcement[];
  filings: { accession: string; filedAt: Date; title: string | null; items: string | null; url: string; matchedTerms: string[] }[];
  ticker: string;
}) {
  if (!announcements.length && !filings.length) return null;
  return (
    <section className="space-y-3">
      <h2 className={h2}>Early signals</h2>
      <p className="text-xs text-muted">
        Contract announcements usually appear here days or weeks before the award reaches USAspending. Announced amounts
        often include unexercised options, so they can be larger than what is eventually obligated, and they are not
        included in the totals above.
      </p>
      {announcements.length > 0 && <AnnouncementsList items={announcements} />}
      {filings.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{ticker} 8-K filings that may relate to federal contracts</h3>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface text-sm">
            {filings.map((f) => (
              <li key={f.accession} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span>
                  {formatDate(f.filedAt)} · 8-K{f.items && <span className="text-muted"> (items {f.items})</span>}
                  {f.matchedTerms.length > 0 && <span className="text-xs text-muted"> · mentions {f.matchedTerms.slice(0, 3).join(", ")}</span>}
                </span>
                <SourceLink href={f.url} label="SEC filing" />
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Selected by keyword screening; read the filing to confirm what it says.</p>
        </div>
      )}
    </section>
  );
}
