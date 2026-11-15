import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/db";
import { getIndexableTickers } from "@/lib/rankings";

/** Sitemaps cap at 50,000 URLs; split with generateSitemaps if companies ever exceed this. */
const MAX_COMPANIES = 40_000;
const MAX_GRANT_PROGRAMS = 5_000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection(); // reads the database at request time, never at build time
  const base = siteConfig.url;
  const [fresh, programs, companies, grantPrograms] = await Promise.all([
    prisma.dataFreshness.findUnique({ where: { source: "usaspending" } }),
    prisma.program.findMany({ select: { slug: true, updatedAt: true } }),
    // Only companies with award data: empty company pages are thin content for search engines.
    getIndexableTickers(MAX_COMPANIES),
    prisma.assistanceListingSummary.findMany({
      where: { plan: "pro" },
      orderBy: { total: "desc" },
      take: MAX_GRANT_PROGRAMS,
      select: { number: true },
    }),
  ]);
  const dataDate = fresh?.lastSuccessfulAt ?? new Date();
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/top-government-contractors`, lastModified: dataDate, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/programs`, lastModified: dataDate, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/grant-programs`, lastModified: dataDate, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/disclaimer`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.1 },
    ...programs.map((p) => ({ url: `${base}/program/${p.slug}`, lastModified: dataDate, changeFrequency: "daily" as const, priority: 0.7 })),
    ...grantPrograms.map((g) => ({
      url: `${base}/grant-programs/${encodeURIComponent(g.number)}`,
      lastModified: dataDate,
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),
    ...companies.map((ticker) => ({
      url: `${base}/company/${encodeURIComponent(ticker)}`,
      lastModified: dataDate,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
}
