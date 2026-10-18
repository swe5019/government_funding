import { describe, expect, it, vi } from "vitest";
import { retry } from "@/lib/retry";
import { backfillMonths } from "@/jobs/usaspending";

describe("retry", () => {
  it("retries until success", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("a")).mockRejectedValueOnce(new Error("b")).mockResolvedValue("ok");
    await expect(retry(fn, { attempts: 3, baseDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops early when shouldRetry says no", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("400"));
    await expect(retry(fn, { attempts: 5, baseDelayMs: 1, shouldRetry: () => false })).rejects.toThrow("400");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("backfillMonths", () => {
  it("covers N years ending with the (partial) current month", () => {
    const months = backfillMonths(3, new Date("2026-10-18T12:00:00Z"));
    expect(months).toHaveLength(37);
    expect(months[0]).toEqual({ start: "2023-10-01", end: "2023-10-31", key: "2023-10" });
    expect(months.at(-1)).toEqual({ start: "2026-10-01", end: "2026-10-18", key: "2026-10" });
    expect(months.find((m) => m.key === "2024-02")?.end).toBe("2024-02-29");
  });
});
