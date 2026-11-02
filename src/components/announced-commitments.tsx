import Link from "next/link";
import { STAGE_LABELS } from "@/config/commitments";
import { SourceLink } from "@/components/source-link";
import type { ResolvedCommitment } from "@/lib/commitments";
import { formatDate, formatUsd, formatUsdCompact } from "@/lib/format";

const h2 = "text-sm font-semibold uppercase tracking-wide text-muted";

/**
 * Official announcements of funding that has not been obligated yet. Kept visually and
 * numerically separate from award data: amounts here are never part of any total.
 */
export function AnnouncedCommitments({ items, scope }: { items: ResolvedCommitment[]; scope: "program" | "company" }) {
  if (!items.length) return null;
  return (
    <section className="space-y-2" aria-labelledby="announced-heading">
      <h2 id="announced-heading" className={h2}>
        Announced, not yet awarded
      </h2>
      <p className="text-xs text-muted">
        Official announcements of proposed funding. No money has been obligated yet, so these amounts are not in USAspending and
        are not included in any totals above. Terms can change or fall through before a final award.
      </p>
      {items.map((c) => (
        <article key={c.id} className="space-y-3 rounded-md border border-dashed border-line bg-surface p-4 text-sm">
          <header className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="rounded bg-warn-bg px-1.5 py-0.5 font-medium text-warn-fg">{STAGE_LABELS[c.stage]}</span>
              <span>{formatDate(new Date(`${c.date}T00:00:00Z`))}</span>
              <span>· {c.agency}</span>
            </div>
            <h3 className="font-medium">{c.title}</h3>
            <p className="text-xs text-muted">{c.note}</p>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium">Company</th>
                  <th className="py-1 pr-3 font-medium">Ticker</th>
                  <th className="py-1 pr-3 text-right font-medium">Proposed amount</th>
                  <th className="hidden py-1 font-medium sm:table-cell">Terms</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {c.recipients.map((r) => (
                  <tr key={r.name}>
                    <td className="py-1.5 pr-3">{r.name}</td>
                    <td className="py-1.5 pr-3 font-mono text-xs">
                      {r.companyTicker ? (
                        <Link href={`/company/${encodeURIComponent(r.companyTicker)}`} className="text-accent underline underline-offset-2">
                          {r.ticker}
                        </Link>
                      ) : (
                        (r.ticker ?? <span className="font-sans text-muted">Private</span>)
                      )}
                    </td>
                    <td className="tabular py-1.5 pr-3 text-right">
                      <span className="sm:hidden">{formatUsdCompact(r.amountUsd)}</span>
                      <span className="hidden sm:inline">{formatUsd(r.amountUsd)}</span>
                    </td>
                    <td className="hidden py-1.5 text-xs text-muted sm:table-cell">
                      {[r.detail, r.equityStake ? "Government equity stake" : null].filter(Boolean).join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
              {scope === "program" && c.recipients.length > 1 && (
                <tfoot className="border-t border-line text-xs text-muted">
                  <tr>
                    <td className="py-1.5 pr-3" colSpan={2}>
                      Total proposed
                    </td>
                    <td className="tabular py-1.5 pr-3 text-right">{formatUsd(c.totalUsd)}</td>
                    <td className="hidden sm:table-cell" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <footer className="text-xs text-muted">
            Source: <SourceLink href={c.sourceUrl} label={c.sourceLabel} /> · Last verified{" "}
            {formatDate(new Date(`${c.verifiedAt}T00:00:00Z`))}
          </footer>
        </article>
      ))}
    </section>
  );
}
