import { commitments, type Commitment, type CommitmentRecipient } from "@/config/commitments";
import { prisma } from "@/lib/db";

export interface ResolvedRecipient extends CommitmentRecipient {
  /** Set when the ticker is a company we track, so the UI can link to its page. */
  companyTicker: string | null;
}

export interface ResolvedCommitment extends Omit<Commitment, "recipients"> {
  recipients: ResolvedRecipient[];
  totalUsd: number;
}

/** Ticker (any share class) -> primary ticker, for companies in the database. */
async function trackedTickers(tickers: string[]): Promise<Map<string, string>> {
  if (!tickers.length) return new Map();
  const rows = await prisma.company.findMany({
    where: { OR: [{ ticker: { in: tickers } }, { tickers: { hasSome: tickers } }] },
    select: { ticker: true, tickers: true },
  });
  const map = new Map<string, string>();
  for (const r of rows) for (const t of [r.ticker, ...r.tickers]) if (tickers.includes(t)) map.set(t, r.ticker);
  return map;
}

/** Announcements not yet in USAspending, newest first. Awarded entries are left to the award data. */
export async function getCommitments(filter: { program: string } | { tickers: string[] }): Promise<ResolvedCommitment[]> {
  const pending = commitments.filter((c) => c.stage !== "awarded");
  const matching = (
    "program" in filter
      ? pending.filter((c) => c.programs.includes(filter.program))
      : pending
          .map((c) => ({ ...c, recipients: c.recipients.filter((r) => r.ticker !== null && filter.tickers.includes(r.ticker)) }))
          .filter((c) => c.recipients.length)
  ).sort((a, b) => b.date.localeCompare(a.date));

  const tracked = await trackedTickers([...new Set(matching.flatMap((c) => c.recipients.flatMap((r) => (r.ticker ? [r.ticker] : []))))]);
  return matching.map((c) => ({
    ...c,
    recipients: c.recipients.map((r) => ({ ...r, companyTicker: r.ticker ? (tracked.get(r.ticker) ?? null) : null })),
    totalUsd: c.recipients.reduce((s, r) => s + r.amountUsd, 0),
  }));
}
