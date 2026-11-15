import { describe, expect, it } from "vitest";
import { displayCompanyName } from "@/lib/format";

describe("displayCompanyName", () => {
  it.each([
    ["LOCKHEED MARTIN CORP", "Lockheed Martin"],
    ["RTX Corp", "RTX"],
    ["RTX CORP", "RTX"],
    ["AT&T INC.", "AT&T"],
    ["L3HARRIS TECHNOLOGIES, INC. /DE/", "L3HARRIS Technologies"],
    ["BANK OF AMERICA CORP", "Bank of America"],
    ["Palantir Technologies Inc.", "Palantir Technologies"],
    ["MICRON TECHNOLOGY INC", "Micron Technology"],
    ["GE AEROSPACE", "GE Aerospace"],
  ])("%s -> %s", (raw, want) => expect(displayCompanyName(raw)).toBe(want));
});
