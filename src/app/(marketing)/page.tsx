import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { JsonLd } from "@/components/json-ld";
import { SearchForm } from "@/components/search-form";
import { programs as programConfigs } from "@/config/programs";
import { dataConfig } from "@/config/data";
import { siteConfig } from "@/config/site";
import { displayCompanyName, formatUsdCompact } from "@/lib/format";
import { listPrograms } from "@/lib/programs/queries";
import { getTopContractors } from "@/lib/rankings";

/** Questions people search for; the answers are also emitted as FAQPage structured data. */
const FAQ: { q: string; a: string }[] = [
  {
    q: "Which public companies get the most government contracts?",
    a: "Defense primes such as Lockheed Martin, RTX, General Dynamics, Boeing and Northrop Grumman usually lead. The top government contractors page ranks public companies by money obligated on large federal awards over the last 12 months.",
  },
  {
    q: "Where does the data come from?",
    a: "Every award comes from USAspending.gov, the official U.S. Treasury database of federal contracts and grants, and links back to the original government record. Award recipients are matched to stock tickers using SEC filings.",
  },
  {
    q: "How do I see a company's federal contracts?",
    a: "Search by company name or ticker. Each company page shows federal money by month, the awarding agencies, the largest awards and the programs it falls under, such as the CHIPS Act or sector themes like AI, space and quantum.",
  },
  {
    q: "Is this investment advice?",
    a: "No. The data is informational only. Government awards can be modified, cancelled or reported late, and matching recipients to public companies is an estimate.",
  },
];

export default function HomePage() {
  return (
    <div className="space-y-12">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: siteConfig.name,
          url: siteConfig.url,
          potentialAction: {
            "@type": "SearchAction",
            target: { "@type": "EntryPoint", urlTemplate: `${siteConfig.url}/search?q={search_term_string}` },
            "query-input": "required name=search_term_string",
          },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        }}
      />
      <section className="mx-auto max-w-2xl space-y-5 pt-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Government contracts and grants to public companies</h1>
        <p className="text-muted">
          See which stocks receive federal money: contracts, grants and program funding by ticker, agency and sector,
          straight from official government records with a link to the source for every award.
        </p>
        <SearchForm />
        <p className="text-sm">
          <Link href="/top-government-contractors" className="text-accent underline underline-offset-2">
            Top government contractors →
          </Link>
          <span className="mx-2 text-muted">·</span>
          <Link href="/programs" className="text-accent underline underline-offset-2">
            By sector: AI, space, quantum, defense →
          </Link>
        </p>
      </section>

      <Suspense fallback={<div className="h-64 animate-pulse rounded-md bg-line" aria-busy="true" />}>
        <TopTen />
      </Suspense>

      <Suspense fallback={<div className="h-40 animate-pulse rounded-md bg-line" aria-busy="true" />}>
        <Sectors />
      </Suspense>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Questions</h2>
        <dl className="space-y-4">
          {FAQ.map((f) => (
            <div key={f.q}>
              <dt className="font-medium">{f.q}</dt>
              <dd className="mt-1 text-sm text-muted">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
      <p className="text-center text-xs text-muted">Informational only. Not investment advice.</p>
    </div>
  );
}

async function TopTen() {
  await connection(); // live data at request time, never read at build
  const rows = await getTopContractors(10);
  if (!rows.length) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold">Biggest federal award recipients, last 12 months</h2>
        <Link href="/top-government-contractors" className="shrink-0 text-sm text-accent hover:underline">
          Top 100 →
        </Link>
      </div>
      <ol className="divide-y divide-line rounded-md border border-line bg-surface text-sm">
        {rows.map((r, i) => (
          <li key={r.cik}>
            <Link href={`/company/${encodeURIComponent(r.ticker)}`} className="flex items-center gap-3 px-3 py-2 hover:bg-bg">
              <span className="w-5 text-muted">{i + 1}</span>
              <span className="font-mono font-medium">{r.ticker}</span>
              <span className="min-w-0 flex-1 truncate">{displayCompanyName(r.name)}</span>
              <span className="tabular-nums">{formatUsdCompact(r.last12)}</span>
            </Link>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">
        Money obligated in the last 12 months on awards with a lifetime value of {formatUsdCompact(dataConfig.minAwardUsd)} or more (free view, 7-day delay). Companies that mostly win smaller contracts are understated.
      </p>
    </section>
  );
}

const THEMES = new Set(programConfigs.filter((p) => p.kind === "theme").map((p) => p.slug));

async function Sectors() {
  await connection();
  const all = await listPrograms("free");
  const themes = all.filter((p) => THEMES.has(p.slug) && Number(p.total) > 0).sort((a, b) => Number(b.total) - Number(a.total));
  if (!themes.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Federal money by sector</h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {themes.map((p) => (
          <li key={p.slug}>
            <Link href={`/program/${p.slug}`} className="block rounded-md border border-line bg-surface px-3 py-2 hover:border-accent">
              <span className="font-medium">{p.name}</span>
              <span className="block text-xs text-muted">
                {formatUsdCompact(Number(p.total))} · {p.publicCompanies} public companies
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
