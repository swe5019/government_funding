/** SIC code -> broad sector, using the SEC's SIC division ranges. */
const RANGES: [from: number, to: number, sector: string][] = [
  [100, 999, "Agriculture"],
  [1000, 1499, "Mining & Energy"],
  [1500, 1799, "Construction"],
  [2000, 2799, "Consumer & Materials"],
  [2800, 2899, "Chemicals & Pharma"],
  [2900, 2999, "Mining & Energy"],
  [3000, 3399, "Industrials"],
  [3400, 3569, "Industrials"],
  [3570, 3579, "Technology"],
  [3580, 3599, "Industrials"],
  [3600, 3699, "Technology"],
  [3700, 3799, "Aerospace & Transportation Equipment"],
  [3800, 3899, "Instruments & Electronics"],
  [3900, 3999, "Consumer & Materials"],
  [4000, 4799, "Transportation"],
  [4800, 4899, "Communications"],
  [4900, 4999, "Utilities"],
  [5000, 5999, "Trade & Retail"],
  [6000, 6799, "Financials & Real Estate"],
  [7000, 7369, "Services"],
  [7370, 7379, "Technology"],
  [7380, 7999, "Services"],
  [8000, 8099, "Healthcare"],
  [8100, 8999, "Services"],
  [9100, 9999, "Public Administration"],
];

export function sectorForSic(sic: string | null | undefined): string | null {
  const n = Number(sic);
  if (!sic || !Number.isFinite(n)) return null;
  return RANGES.find(([a, b]) => n >= a && n <= b)?.[2] ?? null;
}
