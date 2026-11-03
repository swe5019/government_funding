import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AwardScopeSections } from "@/components/award-scope-sections";
import { LastUpdated } from "@/components/last-updated";
import { SourceLink } from "@/components/source-link";
import { dataWindow } from "@/lib/gating/dataCutoff";
import { getViewer } from "@/lib/gating/viewer";
import { getGrantProgram, grantProgramName, grantProgramSourceUrl } from "@/lib/programs/grant-programs";

export async function generateMetadata({ params }: PageProps<"/grant-programs/[number]">): Promise<Metadata> {
  const { number } = await params;
  const listing = await getGrantProgram(decodeURIComponent(number));
  const name = listing ? grantProgramName(listing) : "Grant program";
  return {
    title: `${name}: public company recipients`,
    description: `Federal awards under ${name}${listing ? ` (Assistance Listing ${listing.number})` : ""} and the public companies that receive them. Informational only, not investment advice.`,
    alternates: { canonical: `/grant-programs/${number}` },
  };
}

export default function GrantProgramPage({ params }: PageProps<"/grant-programs/[number]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-md bg-line" aria-busy="true" />}>
      <GrantProgram params={params} />
    </Suspense>
  );
}

async function GrantProgram({ params }: { params: PageProps<"/grant-programs/[number]">["params"] }) {
  const number = decodeURIComponent((await params).number);
  const listing = await getGrantProgram(number);
  if (!listing) notFound();
  const viewer = await getViewer();
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <Link href="/grant-programs" className="text-xs text-muted hover:underline">
          ← Every federal grant program
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{grantProgramName(listing)}</h1>
        <p className="max-w-3xl text-sm text-muted">
          Official federal assistance program <span className="font-mono">{listing.number}</span> (SAM.gov Assistance Listing).
          Totals are every award in the data that cites this program number.
        </p>
        <p className="text-sm">
          Official program information: <SourceLink href={grantProgramSourceUrl(listing.number)} label="SAM.gov Assistance Listings" />
        </p>
        <LastUpdated viewer={viewer} />
      </header>
      <AwardScopeSections scope={{ listing: listing.number }} win={dataWindow(viewer.entitlements)} />
    </div>
  );
}
