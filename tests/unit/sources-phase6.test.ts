import { describe, expect, it } from "vitest";
import { searchDocuments, searchUrl } from "@/lib/sources/fedreg/client";
import { samDate, toAwardNotice } from "@/lib/sources/sam/opportunities";

describe("Federal Register client", () => {
  const q = { terms: ['"CHIPS Incentives Program"'], agencies: ["national-institute-of-standards-and-technology"] };

  it("builds a filtered search URL", () => {
    const u = new URL(searchUrl(q.terms[0], q, "2026-09-18"));
    expect(u.pathname).toBe("/api/v1/documents.json");
    expect(u.searchParams.get("conditions[term]")).toBe('"CHIPS Incentives Program"');
    expect(u.searchParams.getAll("conditions[agencies][]")).toEqual(["national-institute-of-standards-and-technology"]);
    expect(u.searchParams.getAll("conditions[type][]")).toEqual(["RULE", "PRORULE", "NOTICE"]);
    expect(u.searchParams.get("conditions[publication_date][gte]")).toBe("2026-09-18");
  });

  it("follows pagination and de-duplicates across terms", async () => {
    const doc = (n: string) => ({ document_number: n, title: n, type: "Notice", abstract: null, publication_date: "2026-10-01", html_url: `https://x/${n}`, agencies: [] });
    const pages: Record<string, unknown> = {};
    const fetchPage = async (url: string) => {
      if (url === "next") return { count: 3, results: [doc("B"), doc("C")], next_page_url: null };
      pages[url] = true;
      return { count: 3, results: [doc("A"), doc("B")], next_page_url: url.includes("first") ? "next" : null };
    };
    const docs = await searchDocuments({ terms: ["first", "second"] }, "2026-01-01", fetchPage);
    expect(docs.map((d) => d.document_number).sort()).toEqual(["A", "B", "C"]);
  });
});

describe("SAM.gov award notices", () => {
  it("formats dates the API way", () => expect(samDate("2026-10-05")).toBe("10/05/2026"));

  it("maps an award notice", () => {
    expect(
      toAwardNotice({
        noticeId: "abc123",
        title: " F-35 Lot 19 ",
        solicitationNumber: "N00019-25-R-0001",
        fullParentPathName: "DEPT OF DEFENSE.DEPT OF THE NAVY.NAVAL AIR SYSTEMS COMMAND",
        postedDate: "2026-10-12",
        naicsCode: "336411",
        uiLink: "https://sam.gov/opp/abc123/view",
        award: { date: "2026-10-10", number: "N0001925C0001", amount: "1,250,000,000", awardee: { name: "LOCKHEED MARTIN CORPORATION", ueiSAM: "zfn2jjxblzt3" } },
      }),
    ).toEqual({
      noticeId: "abc123",
      title: "F-35 Lot 19",
      solicitationNumber: "N00019-25-R-0001",
      postedDate: "2026-10-12",
      awardDate: "2026-10-10",
      awardNumber: "N0001925C0001",
      amount: 1_250_000_000,
      awardeeName: "LOCKHEED MARTIN CORPORATION",
      awardeeUei: "ZFN2JJXBLZT3",
      department: "DEPT OF DEFENSE",
      office: "NAVAL AIR SYSTEMS COMMAND",
      naicsCode: "336411",
      url: "https://sam.gov/opp/abc123/view",
    });
  });

  it("tolerates missing award data and rejects incomplete notices", () => {
    expect(toAwardNotice({ noticeId: "x", title: "t", postedDate: "2026-10-01" })).toMatchObject({ amount: null, awardeeUei: null, url: "https://sam.gov/opp/x/view" });
    expect(toAwardNotice({ noticeId: "", title: "t", postedDate: "2026-10-01" })).toBeNull();
  });
});
