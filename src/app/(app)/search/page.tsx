import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LastUpdated } from "@/components/last-updated";
import { SearchForm } from "@/components/search-form";
import { formatUsdCompact, recipientTypeLabel } from "@/lib/format";
import { dataWindow } from "@/lib/gating/dataCutoff";
import { getViewer } from "@/lib/gating/viewer";
import { search } from "@/lib/search/search";

export const metadata: Metadata = { title: "Search" };

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Search federal award recipients</h1>
      <Suspense fallback={<SearchSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const viewer = await getViewer();
  const win = dataWindow(viewer.entitlements);
  const results = q ? await search(q, win) : null;
  const historyYears = viewer.entitlements.historyYears;

  return (
    <>
      <SearchForm defaultValue={q} autoFocus={!q} />
      <LastUpdated viewer={viewer} />

      {results && (
        <div className="space-y-8">
          {results.companies.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Public companies</h2>
              <ul className="divide-y divide-line rounded-md border border-line bg-surface">
                {results.companies.map((c) => (
                  <li key={c.cik} className="px-4 py-2 text-sm">
                    <span className="font-mono font-semibold">{c.ticker}</span> · {c.name}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Award recipients</h2>
            {results.recipients.length === 0 ? (
              <p className="text-sm text-muted">No recipients match &ldquo;{results.query}&rdquo;.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-line bg-surface">
                <table className="w-full text-sm">
                  <thead className="border-b border-line text-left text-xs text-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">Recipient</th>
                      <th className="hidden px-4 py-2 font-medium sm:table-cell">Type</th>
                      <th className="hidden px-4 py-2 font-medium md:table-cell">Location</th>
                      <th className="px-4 py-2 text-right font-medium">Last 12 months</th>
                      <th className="px-4 py-2 text-right font-medium">
                        {historyYears ? `Last ${historyYears} years` : "All time"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {results.recipients.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-2">
                          <Link href={`/recipient/${encodeURIComponent(r.id)}`} className="font-medium hover:underline">
                            {r.name}
                          </Link>
                          {r.parentName && r.parentName !== r.name && (
                            <div className="text-xs text-muted">Parent: {r.parentName}</div>
                          )}
                          {r.uei && <div className="font-mono text-xs text-muted">UEI {r.uei}</div>}
                        </td>
                        <td className="hidden px-4 py-2 text-muted sm:table-cell">{recipientTypeLabel(r.recipientType)}</td>
                        <td className="hidden px-4 py-2 text-muted md:table-cell">{[r.stateCode, r.countryCode].filter(Boolean).join(", ") || "—"}</td>
                        <td className="tabular px-4 py-2 text-right">{formatUsdCompact(r.last12m)}</td>
                        <td className="tabular px-4 py-2 text-right">{formatUsdCompact(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-xs text-muted">
              Amounts are net obligations (new awards plus modifications, minus de-obligations) by action date.
              Ticker links for recipients arrive with company matching.
            </p>
          </section>

          {results.agencies.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Agencies</h2>
              <ul className="divide-y divide-line rounded-md border border-line bg-surface">
                {results.agencies.map((a) => (
                  <li key={a.code} className="px-4 py-2 text-sm">
                    {a.name}
                    {a.abbreviation && <span className="text-muted"> ({a.abbreviation})</span>}
                    <span className="ml-2 font-mono text-xs text-muted">{a.code}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function SearchSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-10 animate-pulse rounded-md bg-line" />
      <div className="h-48 animate-pulse rounded-md bg-line" />
    </div>
  );
}
