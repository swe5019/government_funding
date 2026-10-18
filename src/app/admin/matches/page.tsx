import Link from "next/link";
import { Suspense } from "react";
import { mappingConfig } from "@/config/mapping";
import { formatUsdCompact } from "@/lib/format";
import { listQueue, listUnmatched, QUEUE_FILTERS, type QueueFilter, type QueueGroup, type QueueMember } from "@/lib/admin/matches";
import { requireAdmin } from "@/lib/admin/require-admin";
import { matchDisplay } from "@/lib/mapping/display";
import { approveAction, bulkApproveAction, correctAction, linkAction, rejectAction, reopenAction } from "../actions";

export default function MatchesPage({ searchParams }: PageProps<"/admin/matches">) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-md bg-line" aria-busy="true" />}>
      <Matches searchParams={searchParams} />
    </Suspense>
  );
}

const btn = "rounded border border-line px-2 py-1 text-xs hover:bg-bg";
const input = "w-20 rounded border border-line bg-surface px-2 py-1 text-xs uppercase";

async function Matches({ searchParams }: { searchParams: PageProps<"/admin/matches">["searchParams"] }) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = sp.tab === "unmatched" ? "unmatched" : "matches";
  const status = (QUEUE_FILTERS.find((f) => f.key === sp.status)?.key ?? "review") as QueueFilter;
  const q = typeof sp.q === "string" ? sp.q : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{tab === "unmatched" ? "Unmatched recipients" : "Ticker match review"}</h1>
          <p className="text-xs text-muted">
            Confirm threshold {mappingConfig.confidenceThreshold} · auto-matching covers recipients with ≥{" "}
            {formatUsdCompact(mappingConfig.minObligationUsd)} obligated · grouped by parent company, largest first
          </p>
        </div>
        <form className="flex gap-2" action="/admin/matches">
          {tab === "unmatched" && <input type="hidden" name="tab" value="unmatched" />}
          {tab === "matches" && <input type="hidden" name="status" value={status} />}
          <input name="q" defaultValue={q} placeholder="Name, ticker or UEI" className="rounded border border-line bg-surface px-2 py-1 text-sm" />
          <button className={btn}>Filter</button>
        </form>
      </div>

      {tab === "matches" ? (
        <>
          <nav className="flex flex-wrap gap-2 text-xs">
            {QUEUE_FILTERS.map((f) => (
              <Link
                key={f.key}
                href={`/admin/matches?status=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={`rounded-full border px-3 py-1 ${f.key === status ? "border-accent text-accent" : "border-line text-muted"}`}
              >
                {f.label}
              </Link>
            ))}
          </nav>
          <Queue groups={await listQueue(status, q)} />
        </>
      ) : (
        <Unmatched q={q} />
      )}
    </div>
  );
}

function Queue({ groups }: { groups: QueueGroup[] }) {
  if (!groups.length) return <p className="text-sm text-muted">Nothing here.</p>;
  return (
    <div className="space-y-3">
      <form id="bulk-approve" action={bulkApproveAction} className="flex justify-end">
        <button className={btn}>Approve selected</button>
      </form>
      {groups.map((g) => (
        <Group key={g.groupId} g={g} />
      ))}
    </div>
  );
}

function Group({ g }: { g: QueueGroup }) {
  const lead = g.members[0];
  const subsidiaries = g.members.length - (g.members.some((m) => m.recipientId === g.groupId) ? 1 : 0);
  return (
    <section className="rounded-md border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <input type="checkbox" name="selected" value={g.groupId} form="bulk-approve" aria-label={`Select ${g.rootName}`} />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{g.rootName}</div>
          <div className="text-xs text-muted">
            <span className="font-mono">{g.groupId}</span> · {formatUsdCompact(g.total)} at stake
            {subsidiaries > 0 && <> · {subsidiaries} subsidiar{subsidiaries === 1 ? "y" : "ies"}</>}
          </div>
        </div>
        <Proposed m={lead} />
        <div className="flex flex-wrap items-center gap-1">
          <ActionButton action={approveAction} field="group" id={g.groupId} label="Approve" />
          <ActionButton action={rejectAction} field="group" id={g.groupId} label="Reject" />
          <CorrectForm action={correctAction} field="group" id={g.groupId} />
          {lead.status !== "PENDING" && <ActionButton action={reopenAction} field="group" id={g.groupId} label="Reopen" />}
        </div>
      </div>
      <details className="border-t border-line px-4 py-2 text-xs">
        <summary className="cursor-pointer text-muted">Evidence and members</summary>
        <Evidence m={lead} />
        <table className="mt-3 w-full">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1 font-medium">Recipient</th>
              <th className="py-1 font-medium">Match</th>
              <th className="py-1 text-right font-medium">Obligated</th>
              <th className="py-1 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {g.members.map((m) => (
              <tr key={m.recipientId}>
                <td className="py-1">
                  {m.name} <span className="font-mono text-muted">{m.uei}</span>
                </td>
                <td className="py-1">
                  <Proposed m={m} />
                </td>
                <td className="tabular py-1 text-right">{formatUsdCompact(m.obligationAtStake)}</td>
                <td className="py-1">
                  <div className="flex justify-end gap-1">
                    <ActionButton action={rejectAction} field="recipient" id={m.recipientId} label="Reject" />
                    <CorrectForm action={correctAction} field="recipient" id={m.recipientId} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function Proposed({ m }: { m: QueueMember }) {
  const display = matchDisplay(m);
  const tone =
    display === "confirmed" ? "text-fg" : display === "possible" ? "text-warn-fg" : "text-muted line-through";
  return (
    <div className={`text-xs ${tone}`}>
      <span className="font-mono font-semibold">{m.ticker ?? "—"}</span> {m.companyName}
      <div className="text-muted">
        {m.confidence.toFixed(2)} · {m.method.replaceAll("_", " ").toLowerCase()} · {m.status.toLowerCase()}
      </div>
    </div>
  );
}

function Evidence({ m }: { m: QueueMember }) {
  const e = m.evidence ?? {};
  return (
    <div className="mt-2 space-y-1">
      {e.chain && e.chain.length > 1 && <p>Parent chain: {e.chain.join(" → ")}</p>}
      {e.normalizedName && <p>Matched as: <span className="font-mono">{e.normalizedName}</span></p>}
      {(e.reasons ?? (e.reason ? [e.reason] : [])).map((r) => (
        <p key={r}>• {r}</p>
      ))}
      {e.candidates && e.candidates.length > 0 && (
        <table className="mt-1">
          <tbody>
            {e.candidates.map((c) => (
              <tr key={c.cik}>
                <td className="pr-3 font-mono">{c.ticker}</td>
                <td className="pr-3">{c.companyName}</td>
                <td className="pr-3 text-muted">{c.source === "FORMER_NAME" ? `former name "${c.matchedName}"` : c.matchedName}</td>
                <td className="tabular">{c.score.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

async function Unmatched({ q }: { q: string }) {
  const rows = await listUnmatched(q);
  if (!rows.length) return <p className="text-sm text-muted">Every eligible recipient has a match decision.</p>;
  return (
    <div>
      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Recipient</th>
              <th className="px-4 py-2 font-medium">Parent</th>
              <th className="px-4 py-2 text-right font-medium">Obligated</th>
              <th className="px-4 py-2 font-medium">Link to ticker</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2">
                  {r.name} <div className="font-mono text-xs text-muted">{r.uei}</div>
                </td>
                <td className="px-4 py-2 text-muted">{r.parentName ?? "—"}</td>
                <td className="tabular px-4 py-2 text-right">{formatUsdCompact(r.total)}</td>
                <td className="px-4 py-2">
                  <CorrectForm action={linkAction} field="recipient" id={r.id} label="Link" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type FormAction = (form: FormData) => Promise<void>;

function ActionButton({ action, field, id, label }: { action: FormAction; field: "group" | "recipient"; id: string; label: string }) {
  return (
    <form action={action}>
      <input type="hidden" name={field} value={id} />
      <button className={btn}>{label}</button>
    </form>
  );
}

function CorrectForm({ action, field, id, label = "Correct" }: { action: FormAction; field: "group" | "recipient"; id: string; label?: string }) {
  return (
    <form action={action} className="flex gap-1">
      <input type="hidden" name={field} value={id} />
      <input name="ticker" required placeholder="Ticker" className={input} aria-label={`${label} to ticker`} />
      <button className={btn}>{label}</button>
    </form>
  );
}
