import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { featureConfig } from "@/config/features";
import { UpgradeNotice } from "@/components/upgrade-notice";
import { formatMonth, formatUsdCompact } from "@/lib/format";
import { dataWindow } from "@/lib/gating/dataCutoff";
import { getViewer } from "@/lib/gating/viewer";
import { companySummaries, listWatchlists } from "@/lib/watchlists";
import {
  addByTickerAction,
  createWatchlistAction,
  deleteWatchlistAction,
  removeItemAction,
  setThresholdAction,
} from "./actions";

export const metadata: Metadata = { title: "Watchlists", robots: { index: false } };

export default function WatchlistsPage({ searchParams }: PageProps<"/watchlists">) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Watchlists</h1>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-md bg-line" />}>
        <Watchlists searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const btn = "rounded-md border border-line px-2.5 py-1 text-xs hover:bg-bg";
const input = "rounded-md border border-line bg-surface px-2 py-1 text-sm";

async function Watchlists({ searchParams }: { searchParams: PageProps<"/watchlists">["searchParams"] }) {
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  if (!viewer.user) redirect("/signin?callbackUrl=/watchlists");
  if (!viewer.entitlements.watchlists) {
    return (
      <UpgradeNotice title="Watchlists and email alerts are part of Pro">
        Track the companies you care about and get an email when one wins a federal award above the amount you choose.
      </UpgradeNotice>
    );
  }
  const lists = await listWatchlists(viewer.user.id);
  const summaries = await companySummaries([...new Set(lists.flatMap((l) => l.items.map((i) => i.companyCik)))], dataWindow(viewer.entitlements).view);
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <>
      <p className="text-sm text-muted">
        You&rsquo;ll get one email after each daily update listing new awards at or above each company&rsquo;s alert threshold.
        Leave a threshold empty to turn alerts off for that company.
      </p>
      {error && (
        <p role="alert" className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg">
          {error}
        </p>
      )}

      {lists.length === 0 && <p className="text-sm text-muted">No watchlists yet. Add a ticker below, or use &ldquo;Watch&rdquo; on any company page.</p>}

      {lists.map((wl) => (
        <section key={wl.id} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-medium">{wl.name}</h2>
            <form action={deleteWatchlistAction}>
              <input type="hidden" name="watchlistId" value={wl.id} />
              <button className={btn}>Delete list</button>
            </form>
          </div>
          <div className="overflow-x-auto rounded-md border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Company</th>
                  <th className="px-4 py-2 text-right font-medium">Last 12 months</th>
                  <th className="hidden px-4 py-2 font-medium sm:table-cell">Latest award</th>
                  <th className="px-4 py-2 font-medium">Alert at or above</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {wl.items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-muted">
                      Empty. Add a ticker below.
                    </td>
                  </tr>
                )}
                {wl.items.map((item) => {
                  const s = summaries.get(item.companyCik);
                  return (
                    <tr key={item.companyCik}>
                      <td className="px-4 py-2">
                        <Link href={`/company/${encodeURIComponent(item.company.ticker)}`} className="hover:underline">
                          <span className="font-mono font-semibold">{item.company.ticker}</span> {item.company.name}
                        </Link>
                      </td>
                      <td className="tabular px-4 py-2 text-right">{formatUsdCompact(s?.last12 ?? 0)}</td>
                      <td className="hidden px-4 py-2 text-muted sm:table-cell">{s?.latest ? formatMonth(s.latest) : "—"}</td>
                      <td className="px-4 py-2">
                        <form action={setThresholdAction} className="flex items-center gap-1">
                          <input type="hidden" name="watchlistId" value={wl.id} />
                          <input type="hidden" name="cik" value={item.companyCik} />
                          <input
                            name="threshold"
                            defaultValue={item.alertThreshold ? formatUsdCompact(item.alertThreshold.toString()) : ""}
                            placeholder="Off"
                            aria-label={`Alert threshold for ${item.company.ticker}`}
                            className={`${input} w-24`}
                          />
                          <button className={btn}>Save</button>
                        </form>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <form action={removeItemAction}>
                          <input type="hidden" name="watchlistId" value={wl.id} />
                          <input type="hidden" name="cik" value={item.companyCik} />
                          <button className={btn} aria-label={`Remove ${item.company.ticker}`}>
                            Remove
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <form action={addByTickerAction} className="flex gap-2">
            <input type="hidden" name="watchlistId" value={wl.id} />
            <input name="ticker" required placeholder="Ticker, e.g. LMT" aria-label="Add ticker" className={`${input} w-40 uppercase`} />
            <button className={btn}>Add</button>
          </form>
        </section>
      ))}

      {lists.length === 0 && (
        <form action={addByTickerAction} className="flex gap-2">
          <input name="ticker" required placeholder="Ticker, e.g. LMT" aria-label="Add ticker" className={`${input} w-40 uppercase`} />
          <button className={btn}>Add to a new watchlist</button>
        </form>
      )}

      {lists.length > 0 && lists.length < featureConfig.watchlists.maxWatchlists && (
        <form action={createWatchlistAction} className="flex gap-2 border-t border-line pt-4">
          <input name="name" required maxLength={60} placeholder="New watchlist name" aria-label="New watchlist name" className={`${input} w-56`} />
          <button className={btn}>Create watchlist</button>
        </form>
      )}
    </>
  );
}
