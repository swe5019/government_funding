import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkBasicAuth } from "@/lib/admin/basic-auth";
import { parseTickersFile } from "@/lib/sources/edgar/client";
import { sectorForSic } from "@/lib/sources/edgar/sic";
import { parseEntity } from "@/lib/sources/sam/client";

const fixture = (f: string) => JSON.parse(readFileSync(path.join(__dirname, "..", "fixtures", f), "utf8"));

describe("parseTickersFile", () => {
  const companies = parseTickersFile(fixture("company_tickers_exchange.json"));
  const byTicker = (t: string) => companies.find((c) => c.ticker === t);

  it("collapses share classes into one company with the first ticker as primary", () => {
    expect(byTicker("GOOGL")).toMatchObject({ cik: "0001652044", tickers: ["GOOGL", "GOOG"] });
    expect(byTicker("GOOG")).toBeUndefined();
  });

  it("flags major exchanges and normalizes names", () => {
    expect(byTicker("LMT")).toMatchObject({ isMajorExchange: true, normalizedName: "LOCKHEED MARTIN" });
    expect(byTicker("ACMS")?.isMajorExchange).toBe(false);
  });

  it("skips rows without a CIK", () => {
    expect(byTicker("BRKN")).toBeUndefined();
    expect(companies).toHaveLength(10);
  });

  it("errors when the file layout changes", () => {
    expect(() => parseTickersFile({ fields: ["cik", "title"], data: [] })).toThrow(/missing field/);
  });
});

describe("sectorForSic", () => {
  it("maps SIC ranges", () => {
    expect(sectorForSic("3812")).toBe("Instruments & Electronics");
    expect(sectorForSic("3721")).toBe("Aerospace & Transportation Equipment");
    expect(sectorForSic("3674")).toBe("Technology");
    expect(sectorForSic(undefined)).toBeNull();
  });
});

describe("parseEntity (SAM)", () => {
  it("finds parents wherever they are nested", () => {
    expect(parseEntity(fixture("sam_entity.json").entityData[0])).toEqual({
      uei: "HJ7KQFRMYN63",
      legalBusinessName: "SIKORSKY AIRCRAFT CORPORATION",
      immediateParentUei: "ZFN2JJXBLZT3",
      immediateParentName: "LOCKHEED MARTIN CORPORATION",
      ultimateParentUei: "ZFN2JJXBLZT3",
      ultimateParentName: "LOCKHEED MARTIN CORPORATION",
    });
  });

  it("returns null parents when the record has none, and null without a UEI", () => {
    expect(parseEntity({ entityRegistration: { ueiSAM: "ABC" } })?.ultimateParentUei).toBeNull();
    expect(parseEntity({ coreData: {} })).toBeNull();
  });
});

describe("checkBasicAuth", () => {
  afterEach(() => vi.unstubAllEnvs());
  const header = (u: string, p: string) => "Basic " + Buffer.from(`${u}:${p}`).toString("base64");

  it("is disabled when credentials aren't configured", () => {
    vi.stubEnv("ADMIN_USERNAME", "");
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect(checkBasicAuth(header("", ""))).toBeNull();
  });

  it("accepts only the configured credentials", () => {
    vi.stubEnv("ADMIN_USERNAME", "admin");
    vi.stubEnv("ADMIN_PASSWORD", "s3cret:with:colons");
    expect(checkBasicAuth(header("admin", "s3cret:with:colons"))).toBe("admin");
    expect(checkBasicAuth(header("admin", "wrong"))).toBeNull();
    expect(checkBasicAuth(header("root", "s3cret:with:colons"))).toBeNull();
    expect(checkBasicAuth(null)).toBeNull();
    expect(checkBasicAuth("Bearer x")).toBeNull();
  });
});
