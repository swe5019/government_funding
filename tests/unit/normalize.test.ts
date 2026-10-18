import { describe, expect, it } from "vitest";
import { normalizeName, recipientKey } from "@/lib/mapping/normalize";

describe("normalizeName", () => {
  it.each([
    ["LOCKHEED MARTIN CORPORATION", "LOCKHEED MARTIN"],
    ["Lockheed Martin Corp.", "LOCKHEED MARTIN"],
    ["ACME SPACE SYSTEMS, L.L.C.", "ACME SPACE SYSTEMS"],
    ["The Boeing Company", "BOEING"],
    ["AT&T Inc.", "AT AND T"],
    ["Raytheon Technologies Holdings, Inc", "RAYTHEON TECHNOLOGIES"],
    ["U.S. Steel Corp", "US STEEL"],
    ["Nestlé S.A.", "NESTLE"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });

  it("keeps a name made only of stop words", () => {
    expect(normalizeName("The Company")).toBe("COMPANY");
  });
});

describe("recipientKey", () => {
  it("uses the UEI when present", () => {
    expect(recipientKey({ uei: " zfn2jjxblzt3 ", name: "x" })).toBe("ZFN2JJXBLZT3");
  });

  it("is stable for the same unidentified recipient and differs by location", () => {
    const a = recipientKey({ name: "Multiple Recipients", stateCode: "IA", countryCode: "USA" });
    const b = recipientKey({ name: "MULTIPLE RECIPIENTS", stateCode: "IA", countryCode: "USA" });
    const c = recipientKey({ name: "MULTIPLE RECIPIENTS", stateCode: "NE", countryCode: "USA" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith("NOUEI:")).toBe(true);
  });
});
