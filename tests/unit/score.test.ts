import { describe, expect, it } from "vitest";
import { matchDisplay } from "@/lib/mapping/display";
import { normalizeName } from "@/lib/mapping/normalize";
import { resolveRoot, type RecipientNode } from "@/lib/mapping/rollup";
import { decide, inheritedConfidence, scoreCandidate, type Candidate } from "@/lib/mapping/score";

const cand = (ticker: string, companyName: string, sim: number, source: Candidate["source"] = "NAME", matched?: string): Candidate => ({
  cik: ticker,
  ticker,
  companyName,
  matchedName: matched ?? normalizeName(companyName),
  source,
  similarity: sim,
});

describe("scoreCandidate", () => {
  it("exact normalized name is high confidence", () => {
    const s = scoreCandidate(normalizeName("LOCKHEED MARTIN CORPORATION"), cand("LMT", "LOCKHEED MARTIN CORP", 1));
    expect(s).toMatchObject({ method: "EXACT_NAME", score: 0.97 });
  });

  it("former SEC name is slightly lower", () => {
    const s = scoreCandidate("RAYTHEON TECHNOLOGIES", cand("RTX", "RTX Corp", 1, "FORMER_NAME", "RAYTHEON TECHNOLOGIES"));
    expect(s).toMatchObject({ method: "ALIAS", score: 0.92 });
  });

  it("caps fuzzy matches below the confirm threshold", () => {
    const s = scoreCandidate("BOEING DEFENSE SPACE SECURITY", cand("BA", "BOEING CO", 0.5));
    expect(s.method).toBe("FUZZY");
    expect(s.score).toBeLessThan(0.85);
  });

  it("treats a multi-word company name prefix as a likely division, still needing review", () => {
    const s = scoreCandidate("LOCKHEED MARTIN ROTARY AND MISSION SYSTEMS", cand("LMT", "LOCKHEED MARTIN CORP", 0.4));
    expect(s.score).toBeGreaterThan(0.6);
    expect(s.score).toBeLessThan(0.85);
  });

  it("ignores one-word prefixes", () => {
    const s = scoreCandidate("TARGET LOGISTICS", cand("TGT", "TARGET CORP", 0.5));
    expect(s.reasons.join()).not.toContain("prefix");
  });

  it("penalizes institutional words the company name lacks", () => {
    const plain = scoreCandidate("GENERAL DYNAMICS", cand("GD", "GENERAL DYNAMICS CORP", 1));
    const foundation = scoreCandidate("GENERAL DYNAMICS FOUNDATION", cand("GD", "GENERAL DYNAMICS CORP", 0.8));
    expect(foundation.score).toBeLessThan(plain.score - 0.3);
  });
});

describe("decide", () => {
  it("never auto-matches non-business recipients", () => {
    expect(decide("UNIVERSITY OF EXAMPLE", "HIGHER_ED", [cand("X", "UNIVERSITY OF EXAMPLE", 1)]).best).toBeNull();
    expect(decide("LOCKHEED MARTIN", "NONPROFIT", [cand("LMT", "LOCKHEED MARTIN", 1)]).best).toBeNull();
  });

  it("drops ambiguous near-ties below the threshold", () => {
    const d = decide("EXAMPLE LABS", "BUSINESS", [cand("EXLB", "Example Labs Holdings Inc", 1), cand("EXLG", "Example Labs Group Inc", 1)]);
    expect(d.best?.score).toBeLessThan(0.85);
    expect(d.best?.reasons.join()).toContain("ambiguous");
    expect(d.candidates).toHaveLength(2);
  });

  it("keeps the best candidate per company and returns null when nothing is close", () => {
    expect(decide("ACME", "BUSINESS", [cand("Z", "ZEBRA TECHNOLOGIES", 0.1)]).best).toBeNull();
    const d = decide("MICRON TECHNOLOGY", "BUSINESS", [
      cand("MU", "MICRON TECHNOLOGY INC", 1),
      { ...cand("MU", "MICRON TECHNOLOGY INC", 0.7, "FORMER_NAME", "MICRON SEMICONDUCTOR") },
    ]);
    expect(d.candidates).toHaveLength(1);
    expect(d.best).toMatchObject({ ticker: "MU", score: 0.97 });
  });

  it("subsidiaries inherit slightly lower confidence", () => {
    expect(inheritedConfidence(0.97)).toBeCloseTo(0.951);
  });
});

describe("resolveRoot", () => {
  const node = (id: string, name: string, parentUei: string | null = null, ultimate: string | null = null, parentName: string | null = null): RecipientNode => ({
    id,
    name,
    parentUei,
    parentName,
    ultimateParentUei: ultimate,
  });

  it("walks up to the top parent, preferring SAM's ultimate parent", () => {
    const nodes = new Map([
      ["SUB", node("SUB", "SIKORSKY", "MID", "TOP")],
      ["TOP", node("TOP", "LOCKHEED MARTIN CORPORATION", "TOP")],
    ]);
    expect(resolveRoot(nodes.get("SUB")!, nodes)).toEqual({ id: "TOP", name: "LOCKHEED MARTIN CORPORATION", chain: ["SUB", "TOP"] });
  });

  it("uses the child's parent name when the parent isn't a recipient", () => {
    const n = node("SUB", "ACME FEDERAL", "P1", null, "ACME HOLDINGS INC");
    expect(resolveRoot(n, new Map([["SUB", n]]))).toEqual({ id: "P1", name: "ACME HOLDINGS INC", chain: ["SUB", "P1"] });
  });

  it("stops on cycles", () => {
    const nodes = new Map([
      ["A", node("A", "A CO", "B")],
      ["B", node("B", "B CO", "A")],
    ]);
    expect(resolveRoot(nodes.get("A")!, nodes).chain).toEqual(["A", "B"]);
  });

  it("a self-parented recipient is its own root", () => {
    const n = node("LM", "LOCKHEED", "LM");
    expect(resolveRoot(n, new Map([["LM", n]])).id).toBe("LM");
  });
});

describe("matchDisplay", () => {
  it.each([
    [{ status: "PENDING", confidence: 0.85, companyCik: "1" }, "confirmed"],
    [{ status: "PENDING", confidence: 0.849, companyCik: "1" }, "possible"],
    [{ status: "APPROVED", confidence: 0.6, companyCik: "1" }, "confirmed"],
    [{ status: "CORRECTED", confidence: 1, companyCik: "1" }, "confirmed"],
    [{ status: "REJECTED", confidence: 0.99, companyCik: "1" }, "hidden"],
    [{ status: "PENDING", confidence: 0.99, companyCik: null }, "hidden"],
  ] as const)("%o -> %s", (m, expected) => {
    expect(matchDisplay(m)).toBe(expected);
  });
});
