import { z } from "zod";
import { prisma } from "@/lib/db";

/** Answers to "What would you pay per month for Pro?" (demand test while Pro isn't on sale). */
export const PRICE_ANSWERS = [
  { value: "0", label: "Nothing, I'd only use the free version" },
  { value: "10", label: "About $10/month" },
  { value: "19", label: "About $19/month" },
  { value: "29+", label: "$29/month or more" },
] as const;
export type PriceAnswer = (typeof PRICE_ANSWERS)[number]["value"];

export const waitlistInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  priceAnswer: z.enum(PRICE_ANSWERS.map((p) => p.value) as [PriceAnswer, ...PriceAnswer[]]).nullable(),
  source: z.string().trim().max(60).regex(/^[a-z0-9:_-]*$/).nullable(),
  userId: z.string().nullable(),
});

/** Add or update a waitlist entry (one per email; a later answer replaces an earlier one). */
export async function joinWaitlist(input: z.input<typeof waitlistInput>) {
  const { email, priceAnswer, source, userId } = waitlistInput.parse(input);
  await prisma.waitlistEntry.upsert({
    where: { email },
    create: { email, priceAnswer, source, userId },
    update: { ...(priceAnswer ? { priceAnswer } : {}), ...(userId ? { userId } : {}) },
  });
}

export interface WaitlistSummary {
  total: number;
  last7Days: number;
  byPrice: Record<PriceAnswer | "skipped", number>;
  bySource: { source: string; n: number }[];
  recent: { email: string; priceAnswer: string | null; source: string | null; createdAt: Date }[];
}

export async function getWaitlistSummary(): Promise<WaitlistSummary> {
  const [total, last7Days, prices, sources, recent] = await Promise.all([
    prisma.waitlistEntry.count(),
    prisma.waitlistEntry.count({ where: { createdAt: { gt: new Date(Date.now() - 7 * 86_400_000) } } }),
    prisma.waitlistEntry.groupBy({ by: ["priceAnswer"], _count: true }),
    prisma.waitlistEntry.groupBy({ by: ["source"], _count: true, orderBy: { _count: { source: "desc" } } }),
    prisma.waitlistEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { email: true, priceAnswer: true, source: true, createdAt: true },
    }),
  ]);
  const byPrice = { "0": 0, "10": 0, "19": 0, "29+": 0, skipped: 0 } as WaitlistSummary["byPrice"];
  for (const p of prices) byPrice[(p.priceAnswer ?? "skipped") as keyof typeof byPrice] = p._count;
  return {
    total,
    last7Days,
    byPrice,
    bySource: sources.map((s) => ({ source: s.source ?? "unknown", n: s._count })),
    recent,
  };
}
