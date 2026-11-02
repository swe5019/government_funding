/**
 * Announced federal funding that is not yet in USAspending: letters of intent and preliminary
 * terms that no agency has obligated yet. Entered by hand from official announcements; shown
 * on program and company pages, labeled as not yet awarded, and never added to award totals.
 *
 * When an entry's money is obligated it appears in USAspending (and so in the award data);
 * then set its stage to "awarded" or remove it. Verify each figure against the official source.
 */
export type CommitmentStage = "letter_of_intent" | "preliminary_terms" | "awarded";

export interface CommitmentRecipient {
  name: string;
  /** Primary ticker when publicly traded; null for private companies. */
  ticker: string | null;
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
];
