import type { PlanKey } from "@/config/plans";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

/** Official federal assistance programs (SAM.gov Assistance Listings) that have paid out money. */

export const GRANT_PROGRAMS_PAGE_SIZE = 50;
export type GrantProgramSort = "total" | "public";

export interface GrantProgramRow {
  number: string;
  title: string | null;
  agencyName: string | null;
  total: number;
  publicTotal: number;
  awards: number;
  recipients: number;
  publicCompanies: number;
  latestAction: Date | null;
}

/** Listing numbers look like "93.855"; anything else is treated as a title search. */
const LISTING_NUMBER = /^\d{2}\.\d{1,3}[a-z]?$/i;

export async function listGrantPrograms(opts: {
  plan: PlanKey;
  q?: string;
  sort?: GrantProgramSort;
  page?: number;
}): Promise<{ rows: GrantProgramRow[]; total: number; page: number; pages: number }> {
  const q = opts.q?.trim() ?? "";
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const filter = !q
    ? Prisma.empty
    : LISTING_NUMBER.test(q)
      ? Prisma.sql`AND s.number LIKE ${q.replace(/[\\%_]/g, (c) => "\\" + c) + "%"}`
      : Prisma.sql`AND (l.title ILIKE ${"%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%"} OR ag.name ILIKE ${"%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%"})`;
  const order = opts.sort === "public" ? Prisma.sql`s."publicTotal" DESC, s.total DESC` : Prisma.sql`s.total DESC`;
  const from = Prisma.sql`
    FROM "AssistanceListingSummary" s
    JOIN "AssistanceListing" l ON l.number = s.number
    LEFT JOIN "Agency" ag ON ag.code = s."agencyCode"
    WHERE s.plan = ${opts.plan} ${filter}`;
  const [rows, [{ n }]] = await Promise.all([
    prisma.$queryRaw<(Omit<GrantProgramRow, "total" | "publicTotal"> & { total: string; publicTotal: string })[]>`
      SELECT s.number, l.title, ag.name AS "agencyName", s.total::text AS total, s."publicTotal"::text AS "publicTotal",
             s.awards, s.recipients, s."publicCompanies", s."latestAction"
      ${from} ORDER BY ${order}, s.number LIMIT ${GRANT_PROGRAMS_PAGE_SIZE} OFFSET ${(page - 1) * GRANT_PROGRAMS_PAGE_SIZE}`,
    prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n ${from}`,
  ]);
  return {
    rows: rows.map((r) => ({ ...r, total: Number(r.total), publicTotal: Number(r.publicTotal) })),
    total: n,
    page,
    pages: Math.max(1, Math.ceil(n / GRANT_PROGRAMS_PAGE_SIZE)),
  };
}

export async function getGrantProgram(number: string) {
  return prisma.assistanceListing.findUnique({ where: { number } });
}

/** Display name: the official title when known, otherwise the listing number. */
export const grantProgramName = (l: { number: string; title: string | null }) => l.title ?? `Assistance Listing ${l.number}`;

/** Official SAM.gov page for the program (search by number; SAM.gov's own URLs use internal ids). */
export const grantProgramSourceUrl = (number: string) =>
  `https://sam.gov/search/?index=fal&keywords=${encodeURIComponent(number)}`;
