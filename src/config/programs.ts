import { themes } from "./themes";

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
  /** Every award from these awarding agencies (toptier codes), e.g. NASA for Space. */
  allFromAgencies?: string[];
  /** NAICS industry code prefixes, e.g. "336414" or "3254". */
  naicsPrefixes?: string[];
  /** Product/service code (PSC) prefixes, e.g. "AR" (space R&D) or "18" (space vehicles). */
  pscPrefixes?: string[];
  /** Restricts keyword matching to these awarding agencies (toptier codes). */
  agencyCodes?: string[];
  /**
   * Case-insensitive phrases matched at the start of a word in the award description (only with
   * agencyCodes): "uas" matches "UAS" and "sUAS"-free text like "UAS training", not "persuasive".
   * A phrase may be a word stem ("quantum comput" matches computing/computer).
   */
  keywords?: string[];
  /**
   * Like keywords (same agencyCodes scope) but matched as whole words only, for short terms
   * that would otherwise hit longer words: "ai" matches "AI" and "AI-enabled", not "air" or "aid".
   */
  wholeWords?: string[];
  /**
   * Every award to recipients confirmed as these companies (primary or share-class tickers), for
   * pure-play companies whose whole federal business belongs in the theme.
   */
  recipientTickers?: string[];
  /** Awards whose description contains any of these (word-start, like keywords) are left out. */
  excludeKeywords?: string[];
}

/** Federal Register search for rules and notices about the program. */
export interface FederalRegisterQuery {
  /** Full-text search terms (quoted phrases allowed); one API query per term. */
  terms: string[];
  /** Agency slugs as used by federalregister.gov (e.g. "national-institute-of-standards-and-technology"). */
  agencies?: string[];
}

export interface ProgramConfig {
  slug: string;
  /** "program": a law or official program. "theme": an investing sector matched by rules. */
  kind: "program" | "theme";
  name: string;
  description: string;
  sourceUrl: string;
  rules: ProgramRules;
  federalRegister?: FederalRegisterQuery;
}

/** Laws and named programs. Sector themes live in ./themes.ts. */
const official: ProgramConfig[] = [
  {
    slug: "chips-act",
    kind: "program",
    name: "CHIPS Act incentives",
    description:
      "Federal financial assistance under the CHIPS and Science Act's CHIPS Incentives Program (Assistance Listing 11.037), run by the CHIPS Program Office at NIST, for building and expanding U.S. semiconductor fabrication, materials and equipment facilities.",
    sourceUrl: "https://www.nist.gov/chips",
    rules: { assistanceListings: ["11.037"] },
    federalRegister: { terms: ['"CHIPS Incentives Program"'], agencies: ["national-institute-of-standards-and-technology"] },
  },
  {
    slug: "quantum",
    kind: "theme",
    name: "Quantum technology",
    description:
      "Federal contracts and grants whose descriptions mention quantum computing, quantum information science, quantum sensing or networking, or qubits, from the agencies that fund most U.S. quantum work (DOE, NSF, DoD including DARPA and the service labs, Commerce/NIST and NASA). This is a keyword match on award descriptions, not an official program: it can include unrelated awards and miss awards with vague descriptions. Much quantum funding goes to universities and national labs, which count in the totals but are not public companies.",
    sourceUrl: "https://www.quantum.gov",
    rules: {
      // DOE, NSF, DoD, Commerce (NIST), NASA
      agencyCodes: ["089", "049", "097", "013", "080"],
      // Specific phrases rather than bare "quantum", which also matches quantum dots,
      // quantum cascade lasers, quantum efficiency and company names.
      keywords: [
        "quantum comput",
        "quantum information",
        "quantum sens",
        "quantum network",
        "quantum communication",
        "quantum key distribution",
        "quantum internet",
        "quantum processor",
        "quantum annealing",
        "quantum algorithm",
        "quantum error correction",
        "quantum simulat",
        "quantum technolog",
        "quantum science",
        "quantum benchmark",
        "quantum navigation",
        "quantum inertial",
        "qubit",
      ],
    },
    federalRegister: { terms: ['"National Quantum Initiative"', '"quantum information science"'] },
  },
];

export const programs: ProgramConfig[] = [...official, ...themes];
