import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { featureConfig } from "@/config/features";
import { LastUpdated } from "@/components/last-updated";
import { MatchBadge } from "@/components/match-badge";
import { SourceLink } from "@/components/source-link";
import { UpgradeNotice } from "@/components/upgrade-notice";
import { getLargeAwardsFeed } from "@/lib/feed";
import { formatDate, formatUsd, formatUsdCompact } from "@/lib/format";
import { dataWindow } from "@/lib/gating/dataCutoff";
import { getViewer } from "@/lib/gating/viewer";

export const metadata: Metadata = {
  title: "New large federal awards",
  description: "Daily feed of newly published large federal awards to public companies.",
};

const cfg = featureConfig.feed;

export default function FeedPage({ searchParams }: PageProps<"/feed">) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">New large awards</h1>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-md bg-line" />}>
        <Feed searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const pick = <T extends number>(raw: unknown, options: readonly T[], fallback: T): T =>
  options.includes(Number(raw) as T) ? (Number(raw) as T) : fallback;

async function Feed({ searchParams }: { searchParams: PageProps<"/feed">["searchParams"] }) {
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  if (!viewer.entitlements.largeAwardsFeed) {
    return (
      <UpgradeNotice title="The daily large-awards feed is part of Pro">
        Every federal award of {formatUsdCompact(cfg.defaultMinUsd)} or more to a public company, as soon as it&rsquo;s
        published, with a link to the government record.
      </UpgradeNotice>
    );
  }
  const minUsd = pick(sp.minUsd, cfg.minUsdOptions, cfg.defaultMinUsd);
  const days = pick(sp.days, cfg.dayOptions, cfg.defaultDays);
  const items = await getLargeAwardsFeed(dataWindow(viewer.entitlements), { minUsd, days });

  // Group by publication day.
  const groups = new Map<string, typeof items>();
  for (const it of items) {
    const k = it.availableAt.toISOString().slice(0, 10);
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }

  return (
    <>
      <LastUpdated viewer={viewer} />
      <form className="flex flex-wrap items-end gap-3 text-sm" action="/feed">
        <label className="space-y-1">
          <span className="block text-xs text-muted">Minimum award</span>
          <select name="minUsd" defaultValue={minUsd} className="rounded-md border border-line bg-surface px-2 py-1.5">
            {cfg.minUsdOptions.map((v) => (
              <option key={v} value={v}>
                {formatUsdCompact(v)}+
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted">Published in the last</span>
          <select name="days" defaultValue={days} className="rounded-md border border-line bg-surface px-2 py-1.5">
            {cfg.dayOptions.map((d) => (
              <option key={d} value={d}>
                {d === 1 ? "24 hours" : `${d} days`}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded-md border border-line px-3 py-1.5 hover:bg-bg">Apply</button>
        {viewer.entitlements.csvExport && (
          <a href={`/api/export/feed?minUsd=${minUsd}&days=${days}`} className="ml-auto text-accent hover:underline">
            Download CSV
          </a>
        )}
      </form>

      {items.length === 0 && <p className="text-sm text-muted">No awards of {formatUsdCompact(minUsd)}+ published in this period.</p>}
      {[...groups].map(([dayKey, dayItems]) => (
        <section key={dayKey} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Published {formatDate(dayKey)}</h2>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {dayItems.map((it) => (
              <li key={it.transactionId} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <MatchBadge link ticker={it.ticker} match={{ status: it.matchStatus, confidence: it.matchConfidence, companyCik: it.matchCik }} />
                    <Link href={`/company/${encodeURIComponent(it.ticker)}`} className="font-medium hover:underline">
                      {it.companyName}
                    </Link>
                  </div>
                  <div>{it.description ?? "Award"}</div>
                  <div className="text-xs text-muted">
                    <Link href={`/recipient/${encodeURIComponent(it.recipientId)}`} className="hover:underline">
                      {it.recipientName}
                    </Link>
                    {it.agencyName && <> · {it.agencyName}</>} · action date {formatDate(it.actionDate)} · <SourceLink href={it.sourceUrl} />
                  </div>
                </div>
                <div className="tabular whitespace-nowrap text-right font-semibold">{formatUsd(it.obligation)}</div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-xs text-muted">
        &ldquo;Published&rdquo; is when the record first appeared in our data. Amounts are obligations for that action (a new award
        or a modification), not total contract value.
      </p>
    </>
  );
}
