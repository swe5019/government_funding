import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { exhibit21Links, parseExhibit21, recentFilings, screenForGovernmentContract } from "@/lib/sources/edgar/filings";

const fx = (f: string) => readFileSync(path.join(__dirname, "..", "fixtures", "edgar", f), "utf8");

describe("EDGAR filings", () => {
  const sub = JSON.parse(fx("submissions-lmt.json"));

  it("lists recent filings of the requested forms with archive URLs", () => {
    const eightKs = recentFilings(sub, "0000936468", ["8-K"], "2025-10-18");
    expect(eightKs).toEqual([
      {
        accession: "0000936468-26-000101",
        form: "8-K",
        filedAt: "2026-10-10",
        items: "8.01,9.01",
        title: "8-K",
        primaryDocument: "lmt-20261010.htm",
        url: "https://www.sec.gov/Archives/edgar/data/936468/000093646826000101/lmt-20261010.htm",
      },
    ]);
    expect(recentFilings(sub, "0000936468", ["10-K"], "2020-01-01")[0].accession).toBe("0000936468-26-000012");
    expect(recentFilings({ cik: "1", name: "x" }, "1", ["8-K"], "2020-01-01")).toEqual([]);
  });

  it("screens 8-Ks for government contract language (needs agency AND contract terms)", () => {
    const hit = screenForGovernmentContract(fx("8k-contract.htm"));
    expect(hit.mentionsAward).toBe(true);
    expect(hit.matchedTerms).toEqual(expect.arrayContaining(["U.S. Navy", "awarded a contract"]));
    expect(screenForGovernmentContract("We entered into a definitive agreement to acquire Acme.").mentionsAward).toBe(false);
    expect(screenForGovernmentContract("The Department of Defense budget was discussed.").mentionsAward).toBe(false);
  });

  it("finds Exhibit 21 in a filing index", () => {
    expect(exhibit21Links(fx("10k-index.htm"), "0000936468", "0000936468-26-000012")).toEqual([
      "https://www.sec.gov/Archives/edgar/data/936468/000093646826000012/lmt-ex21.htm",
    ]);
  });

  it("extracts subsidiary names, skipping headers, jurisdictions and blanks", () => {
    expect(parseExhibit21(fx("ex21.htm"))).toEqual([
      "Sikorsky Aircraft Corporation",
      "Lockheed Martin Space Systems LLC",
      "Example Rotorcraft Services, Inc.",
    ]);
    expect(parseExhibit21("SUBSIDIARIES\nAcme Federal Services LLC    Virginia\nNot a company line\nAcme UK Ltd\tEngland")).toEqual([
      "Acme Federal Services LLC",
      "Acme UK Ltd",
    ]);
  });
});
