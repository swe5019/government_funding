import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LastUpdated } from "@/components/last-updated";
import { formatUsdCompact } from "@/lib/format";
import { dataWindow } from "@/lib/gating/dataCutoff";
import { getViewer } from "@/lib/gating/viewer";
import { listPrograms } from "@/lib/programs/queries";

export const metadata: Metadata = {
  title: "Federal funding programs",
  description: "Which public companies receive money from major federal programs like the CHIPS Act.",
};

export default function ProgramsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Federal funding programs</h1>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-md bg-line" aria-busy="true" />}>
        <Programs />
      </Suspense>
    </div>
  );
}

async function Programs() {
  const viewer = await getViewer();
  const programs = await listPrograms(dataWindow(viewer.entitlements));
  return (
    <>
      <LastUpdated viewer={viewer} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {programs.map((p) => (
          <li key={p.slug} className="rounded-md border border-line bg-surface p-4">
            <Link href={`/program/${p.slug}`} className="text-lg font-medium hover:underline">
              {p.name}
            </Link>
            <p className="mt-1 line-clamp-3 text-sm text-muted">{p.description}</p>
            <p className="mt-3 text-sm">
              <span className="font-semibold">{formatUsdCompact(p.total)}</span> obligated ·{" "}
              {p.publicCompanies} public {p.publicCompanies === 1 ? "company" : "companies"}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
