import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LastUpdated } from "@/components/last-updated";
import { formatDate, formatUsdCompact } from "@/lib/format";
import { getViewer } from "@/lib/gating/viewer";
import { grantProgramName, listGrantPrograms, type GrantProgramSort } from "@/lib/programs/grant-programs";

export const metadata: Metadata = {
  title: "Every federal grant program",
  description:
    "All official federal assistance programs (SAM.gov Assistance Listings) that have paid out money, with totals and the public companies they fund.",
  alternates: { canonical: "/grant-programs" },
};

export default function GrantProgramsPage({ searchParams }: PageProps<"/grant-programs">) {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/programs" className="text-xs text-muted hover:underline">
          ← Programs and sectors
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Every federal grant program</h1>
        <p className="max-w-3xl text-sm text-muted">
          Official federal assistance programs (SAM.gov Assistance Listings, formerly CFDA) that have paid out money in the
          award data, from USAspending.gov. Grants, loans and other assistance only: contracts are not organized into programs,
          so see the sector themes for those.
        </p>
      </header>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-md bg-line" aria-busy="true" />}>
        <Directory searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Directory({ searchParams }: { searchParams: PageProps<"/grant-programs">["searchParams"] }) {
  const [viewer, sp] = await Promise.all([getViewer(), searchParams]);
  const q = typeof sp.q === "string" ? sp.q : "";
  const sort: GrantProgramSort = sp.sort === "public" ? "public" : "total";
  const page = Number(typeof sp.page === "string" ? sp.page : 1) || 1;
  const { rows, total, pages } = await listGrantPrograms({ plan: viewer.plan, q, sort, page });
  const link = (over: Record<string, string | number>) => {
    const params = new URLSearchParams({ ...(q ? { q } : {}), ...(sort !== "total" ? { sort } : {}), page: String(page) });
    for (const [k, v] of Object.entries(over)) params.set(k, String(v));
    if (params.get("page") === "1") params.delete("page");
    return `/grant-programs${params.size ? `?${params}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <LastUpdated viewer={viewer} />
      <form className="flex flex-wrap items-center gap-2" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Program name, number (e.g. 93.855) or agency"
          aria-label="Search grant programs"
          className="w-80 max-w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm"
        />
        {sort !== "total" && <input type="hidden" name="sort" value={sort} />}
        <button className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-bg">Search</button>
        <span className="text-sm text-muted">
          {total.toLocaleString()} {total === 1 ? "program" : "programs"}
        </span>
      </form>
      <div className="flex gap-3 text-sm">
        <span className="text-muted">Sort by:</span>
        <Link href={link({ sort: "total", page: 1 })} aria-current={sort === "total" ? "true" : undefined} className={sort === "total" ? "font-semibold" : "text-accent underline underline-offset-2"}>
          Total obligated
        </Link>
        <Link href={link({ sort: "public", page: 1 })} aria-current={sort === "public" ? "true" : undefined} className={sort === "public" ? "font-semibold" : "text-accent underline underline-offset-2"}>
          Money to public companies
        </Link>
      </div>
      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Program</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">Agency</th>
              <th className="px-3 py-2 text-right font-medium">Obligated</th>
              <th className="px-3 py-2 text-right font-medium">To public companies</th>
              <th className="hidden px-3 py-2 font-medium sm:table-cell">Latest award</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.number}>
                <td className="px-3 py-2">
                  <Link href={`/grant-programs/${encodeURIComponent(r.number)}`} className="font-medium hover:underline">
                    {grantProgramName(r)}
                  </Link>
                  <div className="font-mono text-xs text-muted">{r.number}</div>
                </td>
                <td className="hidden px-3 py-2 text-muted md:table-cell">{r.agencyName ?? "—"}</td>
                <td className="tabular px-3 py-2 text-right">{formatUsdCompact(r.total)}</td>
                <td className="tabular px-3 py-2 text-right">
                  {r.publicCompanies > 0 ? (
                    <>
                      {formatUsdCompact(r.publicTotal)}
                      <div className="text-xs text-muted">
                        {r.publicCompanies} {r.publicCompanies === 1 ? "company" : "companies"}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2 text-muted sm:table-cell">{r.latestAction ? formatDate(r.latestAction) : "—"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted">
                  No programs{q ? ` match “${q}”` : " yet"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="flex items-center gap-3 text-sm" aria-label="Pages">
          {page > 1 && <Link href={link({ page: page - 1 })} className="text-accent underline underline-offset-2">← Previous</Link>}
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          {page < pages && <Link href={link({ page: page + 1 })} className="text-accent underline underline-offset-2">Next →</Link>}
        </nav>
      )}
    </div>
  );
}
