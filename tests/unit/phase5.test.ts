import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";
import { filtersToQuery, parseScreenerFilters } from "@/lib/screener/filters";

describe("csv", () => {
  it("quotes and escapes", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(new Date("2026-03-01T12:00:00Z"))).toBe("2026-03-01");
  });
  it("neutralizes spreadsheet formulas but keeps negative numbers numeric", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-150000.00")).toBe("-150000.00");
    expect(csvCell(-5)).toBe("-5");
  });
  it("builds CRLF rows", () => {
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("a,b\r\n1,x\r\n");
  });
});

describe("screener filters", () => {
  it("parses valid filters", () => {
    expect(parseScreenerFilters({ minLast12: "1000000", minGrowth: "-10", agency: "097", sort: "growth", dir: "asc" })).toEqual({
      minLast12: 1_000_000,
      minGrowth: -10,
      agency: "097",
      sort: "growth",
      dir: "asc",
    });
  });
  it("drops invalid values instead of failing", () => {
    const f = parseScreenerFilters({ minLast12: "abc", agency: "'; DROP TABLE", sort: "evil", minToMarketCap: "-5" });
    expect(f).toEqual({ sort: "last12", dir: "desc" });
  });
  it("round-trips to a query string", () => {
    expect(filtersToQuery({ minGrowth: 25, sort: "growth", sector: undefined })).toBe("minGrowth=25&sort=growth");
  });
});

import { scrubEvent, scrubUrl } from "@/lib/monitoring/scrub";

describe("monitoring scrub", () => {
  it("redacts keys in URLs and strips cookies, auth headers and user", () => {
    expect(scrubUrl("https://api.sam.gov/x?api_key=SECRET&ueiSAM=ABC")).toBe("https://api.sam.gov/x?api_key=[redacted]&ueiSAM=ABC");
    const ev = scrubEvent({
      request: { url: "https://app/api/auth/callback?token=t1&email=a@b.c", cookies: { s: "1" }, headers: { Cookie: "x", "User-Agent": "ua", Authorization: "y" } },
      user: { email: "a@b.c" },
    });
    expect(ev).toEqual({ request: { url: "https://app/api/auth/callback?token=[redacted]&email=[redacted]", headers: { "User-Agent": "ua" } } });
  });
});
