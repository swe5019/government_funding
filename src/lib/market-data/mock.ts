import type { DailyBar, MarketDataProvider } from "./types";

/** Deterministic PRNG (mulberry32) so the same ticker always yields the same series. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

const EPOCH = Date.UTC(2015, 0, 1);
const DAY = 86_400_000;

/**
 * SIMULATED prices for development and tests only: a seeded random walk per ticker, walked
 * from a fixed epoch so any date range is consistent with any other. Weekdays only.
 */
export const mockProvider: MarketDataProvider = {
  name: "mock",
  isSimulated: true,
  async getDailyBars(ticker, from, to) {
    const rand = rng(hash(ticker.toUpperCase()));
    const start = Date.parse(from + "T00:00:00Z");
    const end = Date.parse(to + "T00:00:00Z");
    let price = 20 + rand() * 280;
    const out: DailyBar[] = [];
    for (let t = EPOCH; t <= end; t += DAY) {
      const dow = new Date(t).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      const open = price;
      price = Math.max(1, price * (1 + (rand() - 0.49) * 0.03));
      const spread = price * rand() * 0.015;
      const volume = Math.round(1e6 + rand() * 9e6);
      if (t < start) continue;
      out.push({
        date: new Date(t).toISOString().slice(0, 10),
        open: round(open),
        high: round(Math.max(open, price) + spread),
        low: round(Math.max(0.01, Math.min(open, price) - spread)),
        close: round(price),
        volume,
      });
    }
    return out;
  },
};

const round = (n: number) => Math.round(n * 100) / 100;
