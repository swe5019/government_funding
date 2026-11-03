/**
 * Announced federal deals that the award data doesn't show: letters of intent and preliminary
 * terms nobody has obligated yet, and announced contract ceilings (often "other transaction"
 * agreements that USAspending omits, or umbrella agreements whose orders trickle in). Entered by
 * hand from announcements; shown on program and company pages and never added to award totals.
 *
 * When an entry's money shows up in USAspending, set its stage to "awarded" (hidden) or remove
 * it. Verify each figure against the source.
 */
export type CommitmentStage = "letter_of_intent" | "preliminary_terms" | "ceiling" | "awarded";

export interface CommitmentRecipient {
  name: string;
  /** Primary ticker when publicly traded; null for private companies. */
  ticker: string | null;
  /** Proposed amount, or the maximum for a "ceiling" entry. */
  amountUsd: number;
  /** Purpose or terms worth showing (e.g. what the money is for). */
  detail?: string;
  /** The government receives equity in exchange. */
  equityStake?: boolean;
}

export interface Commitment {
  id: string;
  /** Date of the announcement (YYYY-MM-DD). */
  date: string;
  title: string;
  agency: string;
  stage: CommitmentStage;
  /** Program pages that list this announcement (src/config/programs.ts slugs). */
  programs: string[];
  sourceUrl: string;
  sourceLabel: string;
  /** Shown under the title. */
  note: string;
  /** When someone last checked the entry against the source (YYYY-MM-DD). */
  verifiedAt: string;
  recipients: CommitmentRecipient[];
}

export const STAGE_LABELS: Record<CommitmentStage, string> = {
  letter_of_intent: "Letter of intent",
  preliminary_terms: "Preliminary terms",
  ceiling: "Contract ceiling announced",
  awarded: "Awarded",
};

export const commitments: Commitment[] = [
  {
    id: "commerce-chips-quantum-2026-05",
    date: "2026-05-21",
    title: "CHIPS incentives for quantum computing: letters of intent with 9 companies",
    agency: "U.S. Department of Commerce (CHIPS Program)",
    stage: "letter_of_intent",
    programs: ["quantum", "chips-act"],
    sourceUrl: "https://www.nist.gov/document/quantum-chips-press-release",
    sourceLabel: "NIST press release",
    note: "Proposed CHIPS and Science Act incentives totaling $2.013 billion. Commerce says the agreements are not final. In exchange, it would take a minority, non-controlling equity stake in each of the seven quantum computing companies.",
    verifiedAt: "2026-11-02",
    recipients: [
      { name: "IBM", ticker: "IBM", amountUsd: 1_000_000_000, detail: "Superconducting quantum wafer foundry (new subsidiary)" },
      { name: "GlobalFoundries", ticker: "GFS", amountUsd: 375_000_000, detail: "Quantum foundry" },
      { name: "D-Wave", ticker: "QBTS", amountUsd: 100_000_000, equityStake: true },
      { name: "Infleqtion", ticker: "INFQ", amountUsd: 100_000_000, equityStake: true },
      { name: "Quantinuum", ticker: "QNT", amountUsd: 100_000_000, equityStake: true },
      { name: "Rigetti Computing", ticker: "RGTI", amountUsd: 100_000_000, equityStake: true },
      { name: "Atom Computing", ticker: null, amountUsd: 100_000_000, equityStake: true },
      { name: "PsiQuantum", ticker: null, amountUsd: 100_000_000, equityStake: true },
      { name: "Diraq", ticker: null, amountUsd: 38_000_000, equityStake: true },
    ],
  },
  {
    id: "dod-cdao-frontier-ai-2025",
    date: "2025-07-14",
    title: "Pentagon frontier AI agreements: up to $200 million each with four AI companies",
    agency: "U.S. Department of Defense (Chief Digital and AI Office)",
    stage: "ceiling",
    programs: ["ai"],
    sourceUrl: "https://breakingdefense.com/2025/07/anthropic-google-and-xai-win-200m-each-from-pentagon-ai-chief-for-agentic-ai/",
    sourceLabel: "Breaking Defense",
    note: "Agreements to develop agentic AI for national security, each with a ceiling of $200 million (OpenAI's was announced in June 2025, the other three on July 14, 2025). These are other transaction agreements, which USAspending often does not show; only a fraction of the ceilings has been obligated.",
    verifiedAt: "2026-11-03",
    recipients: [
      { name: "Google (Alphabet)", ticker: "GOOGL", amountUsd: 200_000_000, detail: "Ceiling; agentic AI workflows" },
      { name: "OpenAI", ticker: null, amountUsd: 200_000_000, detail: "Ceiling" },
      { name: "Anthropic", ticker: null, amountUsd: 200_000_000, detail: "Ceiling" },
      { name: "xAI", ticker: null, amountUsd: 200_000_000, detail: "Ceiling" },
    ],
  },
  {
    id: "army-palantir-enterprise-2025",
    date: "2025-07-31",
    title: "Army enterprise agreement with Palantir: up to $10 billion over 10 years",
    agency: "U.S. Army",
    stage: "ceiling",
    programs: ["ai"],
    sourceUrl: "https://www.theregister.com/2025/08/01/palantir_us_army_contract/",
    sourceLabel: "The Register",
    note: "A 10-year enterprise agreement consolidating 75 existing Army contracts for Palantir software and data platforms, with a ceiling of $10 billion. Orders under it are placed over time; the ceiling is a maximum, not money committed.",
    verifiedAt: "2026-11-03",
    recipients: [{ name: "Palantir Technologies", ticker: "PLTR", amountUsd: 10_000_000_000, detail: "Ceiling; consolidates 75 contracts" }],
  },
  {
    id: "dod-maven-ceiling-2025",
    date: "2025-05-21",
    title: "Maven Smart System contract ceiling raised by $795 million",
    agency: "U.S. Department of Defense",
    stage: "ceiling",
    programs: ["ai"],
    sourceUrl: "https://seekingalpha.com/news/4451323-palantir-awarded-795m-u-s-army-contract-modification",
    sourceLabel: "Seeking Alpha",
    note: "Contract modification raising the ceiling of Palantir's Maven Smart System (AI targeting and decision support) by $795 million, for expected demand from combatant commands through May 2029.",
    verifiedAt: "2026-11-03",
    recipients: [{ name: "Palantir Technologies", ticker: "PLTR", amountUsd: 795_000_000, detail: "Ceiling increase" }],
  },
];
