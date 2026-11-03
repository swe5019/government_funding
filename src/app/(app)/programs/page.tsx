import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LastUpdated } from "@/components/last-updated";
import { programs as programConfigs } from "@/config/programs";
import { formatUsdCompact } from "@/lib/format";
import { getViewer } from "@/lib/gating/viewer";
import { listGrantPrograms } from "@/lib/programs/grant-programs";
import { listPrograms, type ProgramListItem } from "@/lib/programs/queries";

export const metadata: Metadata = {
  title: "Federal funding programs and sectors",
  description:
    "Which public companies receive federal money, by program (CHIPS Act), by sector (space, AI, health, defense tech, energy, cannabis) and across every federal grant program.",
};

export default function ProgramsPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Programs and sectors</h1>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-md bg-line" aria-busy="true" />}>
        <Programs />
      </Suspense>
    </div>
  );
}

const KIND = new Map(programConfigs.map((p) => [p.slug, p.kind]));
const h2 = "text-sm font-semibold uppercase tracking-wide text-muted";

async function Programs() {
  const viewer = await getViewer();
  const [all, grants] = await Promise.all([listPrograms(viewer.plan), listGrantPrograms({ plan: viewer.plan })]);
  const official = all.filter((p) => KIND.get(p.slug) !== "theme");
  const themes = all.filter((p) => KIND.get(p.slug) === "theme");
  return (
    <>
      <LastUpdated viewer={viewer} />
      <section className="space-y-2">
        <h2 className={h2}>Sector themes</h2>
        <p className="text-xs text-muted">
          Contracts and grants grouped by investing sector using agencies, industry codes and keywords. Each page explains
          exactly what it matches.
        </p>
        <ProgramGrid items={themes} />
      </section>
      <section className="space-y-2">
        <h2 className={h2}>Laws and programs</h2>
        <ProgramGrid items={official} />
      </section>
      <section className="space-y-2">
        <h2 className={h2}>Every federal grant program</h2>
        <Link
          href="/grant-programs"
          className="block rounded-md border border-line bg-surface p-4 hover:border-accent"
        >
          <span className="text-lg font-medium">All {grants.total.toLocaleString()} official grant programs →</span>
          <span className="mt-1 block text-sm text-muted">
            Every federal assistance program (SAM.gov Assistance Listing) that has paid out money in our data, searchable by name,
            number or agency, with the public companies it funds.
          </span>
        </Link>
      </section>
    </>
  );
}

function ProgramGrid({ items }: { items: ProgramListItem[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((p) => (
        <li key={p.slug} className="rounded-md border border-line bg-surface p-4">
          <Link href={`/program/${p.slug}`} className="text-lg font-medium hover:underline">
            {p.name}
          </Link>
          <p className="mt-1 line-clamp-3 text-sm text-muted">{p.description}</p>
          <p className="mt-3 text-sm">
            <span className="font-semibold">{formatUsdCompact(p.total)}</span> obligated · {p.publicCompanies} public{" "}
            {p.publicCompanies === 1 ? "company" : "companies"}
          </p>
        </li>
      ))}
    </ul>
  );
}
