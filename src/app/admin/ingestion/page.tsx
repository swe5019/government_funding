import { Suspense } from "react";
import { formatDate, formatDateTime } from "@/lib/format";
import { listFreshness, listRecentRuns } from "@/lib/admin/matches";
import { requireAdmin } from "@/lib/admin/require-admin";

export default function IngestionPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-md bg-line" aria-busy="true" />}>
      <Runs />
    </Suspense>
  );
}

const STATUS_TONE: Record<string, string> = {
  SUCCEEDED: "text-fg",
  RUNNING: "text-accent",
  FAILED: "text-warn-fg font-semibold",
};

async function Runs() {
  await requireAdmin();
  const [runs, fresh] = await Promise.all([listRecentRuns(), listFreshness()]);
  return (
    <div className="space-y-6">
      <section>
        <h1 className="mb-2 text-xl font-semibold">Data freshness</h1>
        <ul className="text-sm">
          {fresh.map((f) => (
            <li key={f.source}>
              <span className="font-medium">{f.source}</span> · last success {formatDateTime(f.lastSuccessfulAt)} · data
              through {formatDate(f.dataThrough)}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Recent runs</h2>
        <div className="overflow-x-auto rounded-md border border-line bg-surface">
          <table className="w-full text-xs">
            <thead className="border-b border-line text-left text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Started</th>
                <th className="px-3 py-2 font-medium">Job</th>
                <th className="px-3 py-2 font-medium">Chunk</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Read</th>
                <th className="px-3 py-2 text-right font-medium">Upserted</th>
                <th className="px-3 py-2 text-right font-medium">Skipped</th>
                <th className="px-3 py-2 font-medium">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-3 py-1.5">{formatDateTime(r.startedAt)}</td>
                  <td className="px-3 py-1.5 font-mono">{r.job}</td>
                  <td className="px-3 py-1.5 font-mono">{r.chunkKey}</td>
                  <td className={`px-3 py-1.5 ${STATUS_TONE[r.status] ?? ""}`}>
                    {r.status.toLowerCase()}
                    {r.attempt > 1 && ` (attempt ${r.attempt})`}
                  </td>
                  <td className="tabular px-3 py-1.5 text-right">{r.rowsRead.toLocaleString()}</td>
                  <td className="tabular px-3 py-1.5 text-right">{r.rowsUpserted.toLocaleString()}</td>
                  <td className="tabular px-3 py-1.5 text-right">{r.rowsSkipped.toLocaleString()}</td>
                  <td className="max-w-xs truncate px-3 py-1.5 text-muted" title={r.error ?? undefined}>
                    {r.error?.split("\n")[0]}
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
