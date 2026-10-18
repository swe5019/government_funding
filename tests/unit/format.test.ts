import { describe, expect, it } from "vitest";
import { formatUsdCompact } from "@/lib/format";

describe("formatUsdCompact", () => {
  it.each([
    [1_450_000_000, "$1.45B"],
    [1_400_000_000, "$1.4B"],
    [10_000_000_000, "$10B"],
    [700_000_000, "$700M"],
    [48_500_000, "$48.5M"],
    [10_000_000, "$10M"],
    [2_300_000, "$2.3M"],
    [750_000, "$750K"],
    [1_200, "$1,200"],
    [-150_000_000, "-$150M"],
    [0, "$0"],
  ])("%d -> %s", (n, s) => expect(formatUsdCompact(n)).toBe(s));
});
