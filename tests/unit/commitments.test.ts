import { describe, expect, it } from "vitest";
import { commitments } from "@/config/commitments";
import { programs } from "@/config/programs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

describe("announced commitments config", () => {
  it("every entry is well-formed and points at real programs", () => {
    const slugs = new Set(programs.map((p) => p.slug));
    expect(new Set(commitments.map((c) => c.id)).size).toBe(commitments.length);
    for (const c of commitments) {
      expect(c.date).toMatch(ISO);
      expect(c.verifiedAt).toMatch(ISO);
      expect(c.sourceUrl).toMatch(/^https:\/\//);
      expect(c.programs.length).toBeGreaterThan(0);
      for (const p of c.programs) expect(slugs.has(p)).toBe(true);
      expect(c.recipients.length).toBeGreaterThan(0);
      for (const r of c.recipients) {
        expect(r.amountUsd).toBeGreaterThan(0);
        if (r.ticker !== null) expect(r.ticker).toMatch(/^[A-Z][A-Z.]{0,5}$/);
      }
    }
  });

  it("the May 2026 quantum letters of intent add up to the announced $2.013 billion", () => {
    const c = commitments.find((x) => x.id === "commerce-chips-quantum-2026-05")!;
    expect(c.recipients).toHaveLength(9);
    expect(c.recipients.reduce((s, r) => s + r.amountUsd, 0)).toBe(2_013_000_000);
    expect(c.recipients.filter((r) => r.equityStake)).toHaveLength(7);
  });
});
