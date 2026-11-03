import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AnnouncedCommitments } from "@/components/announced-commitments";
import { AwardScopeSections } from "@/components/award-scope-sections";
import { LastUpdated } from "@/components/last-updated";
import { SourceLink } from "@/components/source-link";
import { getProgramDocuments } from "@/lib/announcements";
import { getCommitments } from "@/lib/commitments";
import { formatDate } from "@/lib/format";
import { dataWindow } from "@/lib/gating/dataCutoff";
import { getViewer } from "@/lib/gating/viewer";
import { getProgram } from "@/lib/programs/queries";

export async function generateMetadata({ params }: PageProps<"/program/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const program = await getProgram(slug);
  return {
    title: program ? `${program.name}: public company recipients` : "Program",
    description: program?.description ?? undefined,
    alternates: { canonical: `/program/${slug}` },
  };
}

export default function ProgramPage({ params }: PageProps<"/program/[slug]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-md bg-line" aria-busy="true" />}>
      <Program params={params} />
    </Suspense>
  );
}

const h2 = "text-sm font-semibold uppercase tracking-wide text-muted";

async function Program({ params }: { params: PageProps<"/program/[slug]">["params"] }) {
  const { slug } = await params;
  const program = await getProgram(slug);
  if (!program) notFound();
  const viewer = await getViewer();
  const win = dataWindow(viewer.entitlements);
  const [documents, commitments] = await Promise.all([getProgramDocuments(slug), getCommitments({ program: slug })]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <Link href="/programs" className="text-xs text-muted hover:underline">
          ← Programs
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{program.name}</h1>
        <p className="max-w-3xl text-sm text-muted">{program.description}</p>
        {program.sourceUrl && (
          <p className="text-sm">
            Official program information: <SourceLink href={program.sourceUrl} label={new URL(program.sourceUrl).hostname} />
          </p>
        )}
        <LastUpdated viewer={viewer} />
      </header>

      <AwardScopeSections
        scope={slug}
        win={win}
        beforeLargest={
          <>
            <AnnouncedCommitments items={commitments} scope="program" />

            {documents.length > 0 && (
              <section className="space-y-2">
                <h2 className={h2}>Federal Register rules and notices</h2>
                <ul className="divide-y divide-line rounded-md border border-line bg-surface text-sm">
                  {documents.map((d) => (
                    <li key={d.documentNumber} className="space-y-0.5 px-4 py-3">
                      <div className="text-xs text-muted">
                        {formatDate(d.publishedAt)} · {d.type}
                        {d.agencyNames.length > 0 && <> · {d.agencyNames.join(", ")}</>}
                      </div>
                      <div className="font-medium">{d.title}</div>
                      {d.abstract && <p className="line-clamp-2 text-xs text-muted">{d.abstract}</p>}
                      <SourceLink href={d.url} label="federalregister.gov" />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        }
      />
    </div>
  );
}
