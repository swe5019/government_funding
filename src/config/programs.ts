/**
 * Funding programs with their own pages. Add a program here, then run
 * `pnpm ingest tag-programs`. An award belongs to a program if it matches ANY listed rule
 * (keywords additionally require agencyCodes, so free text can't pull in unrelated awards).
 *
 * Verify identifiers against SAM.gov Assistance Listings / USAspending before adding.
 */
export interface ProgramRules {
  /** Assistance listing (CFDA) numbers, e.g. "11.037". */
  assistanceListings?: string[];
  /** Disaster/emergency fund codes (DEFC) on the award. */
  defCodes?: string[];
  /** Restricts keyword matching to these awarding agencies (toptier codes). */
  agencyCodes?: string[];
  /** Case-insensitive phrases matched in the award description (only with agencyCodes). */
  keywords?: string[];
}

export interface ProgramConfig {
  slug: string;
  name: string;
  description: string;
  sourceUrl: string;
  rules: ProgramRules;
}

export const programs: ProgramConfig[] = [
  {
    slug: "chips-act",
    name: "CHIPS Act incentives",
    description:
      "Federal financial assistance under the CHIPS and Science Act's CHIPS Incentives Program (Assistance Listing 11.037), run by the CHIPS Program Office at NIST, for building and expanding U.S. semiconductor fabrication, materials and equipment facilities.",
    sourceUrl: "https://www.nist.gov/chips",
    rules: { assistanceListings: ["11.037"] },
  },
];
