import { connection } from "next/server";
import { prisma } from "@/lib/db";

/** Data older than this many hours marks the service "degraded" (daily ingest missed). */
const STALE_HOURS = 36;

/**
 * Uptime check: 200 when the database answers and USAspending data was refreshed recently,
 * 503 otherwise. Point an uptime monitor here (alert on non-200).
 */
export async function GET() {
  await connection();
  try {
    const fresh = await prisma.dataFreshness.findMany({ select: { source: true, lastSuccessfulAt: true } });
    const usa = fresh.find((f) => f.source === "usaspending");
    const ageHours = usa ? (Date.now() - usa.lastSuccessfulAt.getTime()) / 3_600_000 : null;
    const stale = ageHours === null || ageHours > STALE_HOURS;
    return Response.json(
      {
        status: stale ? "degraded" : "ok",
        database: "ok",
        sources: Object.fromEntries(fresh.map((f) => [f.source, f.lastSuccessfulAt.toISOString()])),
        usaspendingAgeHours: ageHours === null ? null : Math.round(ageHours),
      },
      { status: stale ? 503 : 200, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json({ status: "down", database: "error" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
