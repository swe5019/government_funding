import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { announcementDate, compactPiid, parseAmount, parseContractsPage, parseRss } from "@/lib/sources/dod/parse";

const fx = (f: string) => readFileSync(path.join(__dirname, "..", "fixtures", "dod", f), "utf8");

describe("DoD contracts page", () => {
  const contracts = parseContractsPage(fx("contracts-page.html"));

  it("extracts one record per contract paragraph, skipping headings and notes", () => {
    expect(contracts).toHaveLength(3);
    expect(contracts.map((c) => c.branch)).toEqual(["NAVY", "NAVY", "AIR FORCE"]);
  });

  it("parses contractor, amount, contract number and contracting activity", () => {
    expect(contracts[0]).toMatchObject({
      contractorName: "Lockheed Martin Corp.",
      normalizedName: "LOCKHEED MARTIN",
      amount: 1_250_000_000,
      contractNumber: "N00019-25-C-0001",
      contractingActivity: "Naval Air Systems Command",
    });
    expect(contracts[1]).toMatchObject({
      contractorName: "Example Shipbuilding LLC",
      amount: 12_500_000,
      contractNumber: "N00024-26-C-4321",
      contractingActivity: "Naval Sea Systems Command",
    });
    expect(contracts[2]).toMatchObject({ contractNumber: "FA8625-26-C-0042", contractingActivity: "Air Force Life Cycle Management Center" });
  });

  it("ids are stable content hashes", () => {
    expect(parseContractsPage(fx("contracts-page.html")).map((c) => c.id)).toEqual(contracts.map((c) => c.id));
  });
});

describe("helpers", () => {
  it("amounts", () => {
    expect(parseAmount("a $1.2 billion contract")).toBe(1_200_000_000);
    expect(parseAmount("$12,500,000.50 contract")).toBe(12_500_000.5);
    expect(parseAmount("no money")).toBeNull();
  });
  it("PIIDs", () => expect(compactPiid("N00019-25-C-0001")).toBe("N0001925C0001"));
  it("RSS and dates", () => {
    const items = parseRss(fx("rss.xml"));
    expect(items.map((i) => i.link)).toEqual([
      "https://www.defense.gov/News/Contracts/Contract/Article/9999001/",
      "https://www.defense.gov/News/Contracts/Contract/Article/9999000/",
    ]);
    expect(announcementDate(items[1].title, items[1].pubDate)).toBe("2026-10-15");
    expect(announcementDate("Contracts", new Date("2026-10-14T21:00:00Z"))).toBe("2026-10-14");
  });
});
