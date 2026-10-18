import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/db";
import { CONFIRMED_SQL } from "@/lib/mapping/sql";

/** Sitemaps cap at 50,000 URLs; split with generateSitemaps if companies ever exceed this. */
const MAX_COMPANIES = 45_000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection(); // reads the database at request time, never at build time
  const base = siteConfig.url;
  const [fresh, programs, companies] = await Promise.all([
    prisma.dataFreshness.findUnique({ where: { source: "usaspending" } }),
    prisma.program.findMany({ select: { slug: true, updatedAt: true } }),
    prisma.$queryRawUnsafe<{ ticker: string }[]>(
      `SELECT DISTINCT c.ticker FROM "TickerMatch" tm JOIN "Company" c ON c.cik = tm."companyCik"
       WHERE ${CONFIRMED_SQL} AND c.ticker NOT LIKE 'X:%' ORDER BY 1 LIMIT $1`,
      MAX_COMPANIES,
    ),
  ]);
  const dataDate = fresh?.lastSuccessfulAt ?? new Date();
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/programs`, lastModified: dataDate, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/disclaimer`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.1 },
    ...programs.map((p) => ({ url: `${base}/program/${p.slug}`, lastModified: dataDate, changeFrequency: "daily" as const, priority: 0.7 })),
    ...companies.map((c) => ({
      url: `${base}/company/${encodeURIComponent(c.ticker)}`,
      lastModified: dataDate,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
}
