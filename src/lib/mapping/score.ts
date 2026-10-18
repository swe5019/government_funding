import { mappingConfig } from "@/config/mapping";

/**
 * Scores candidate public companies for a recipient (or its roll-up root). Pure functions;
 * the matching job supplies candidates found with pg_trgm. See docs/MAPPING.md.
 */

export type CandidateSource = "NAME" | "FORMER_NAME";
export type ScoreMethod = "EXACT_NAME" | "ALIAS" | "FUZZY";

export interface Candidate {
  cik: string;
  ticker: string;
  companyName: string;
  /** The normalized company name or alias this candidate was found by. */
  matchedName: string;
  source: CandidateSource;
  /** pg_trgm similarity between the recipient name and matchedName. */
  similarity: number;
}

export interface ScoredCandidate extends Candidate {
  score: number;
  method: ScoreMethod;
  reasons: string[];
}

export interface MatchDecision {
  best: ScoredCandidate | null;
  candidates: ScoredCandidate[];
}

/** Recipient types we never auto-match to a company. */
const NON_BUSINESS_TYPES = new Set(["NONPROFIT", "GOVERNMENT", "HIGHER_ED", "INDIVIDUAL"]);

/** Words that mark an organization as something other than the company it resembles. */
const DISTINGUISHING = new Set([
  "UNIVERSITY",
  "COLLEGE",
  "SCHOOL",
  "HOSPITAL",
  "FOUNDATION",
  "INSTITUTE",
  "ASSOCIATION",
  "SOCIETY",
  "COUNTY",
  "CITY",
  "STATE",
  "DEPARTMENT",
  "AUTHORITY",
  "DISTRICT",
  "TRIBE",
  "TRIBAL",
  "COOPERATIVE",
  "CHURCH",
  "TRUST",
  "FUND",
]);

/** Below this, a candidate isn't stored at all. */
export const MIN_STORED_CONFIDENCE = 0.5;
/** Fuzzy matches are capped below the confirm threshold so a human reviews them... */
const FUZZY_CAP = 0.84;
/** ...unless the names are nearly identical. */
const NEAR_IDENTICAL_CAP = 0.9;
const AMBIGUITY_GAP = 0.05;
const AMBIGUITY_PENALTY = 0.15;
const DISTINGUISHING_PENALTY = 0.2;

const tokens = (s: string) => new Set(s.split(" ").filter(Boolean));

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function scoreCandidate(recipientName: string, c: Candidate): ScoredCandidate {
  const reasons: string[] = [];
  const rTokens = tokens(recipientName);
  const cTokens = tokens(c.matchedName);
  let score: number;
  let method: ScoreMethod;

  if (recipientName === c.matchedName) {
    method = c.source === "NAME" ? "EXACT_NAME" : "ALIAS";
    score = c.source === "NAME" ? 0.97 : 0.92;
    reasons.push(c.source === "NAME" ? "exact normalized name" : "exact match on a former SEC name");
  } else {
    method = "FUZZY";
    const jac = jaccard(rTokens, cTokens);
    // Company name is the leading part of the recipient's ("LOCKHEED MARTIN" in
    // "LOCKHEED MARTIN SPACE"): likely a division, but needs review.
    const isPrefix = cTokens.size >= 2 && recipientName.startsWith(c.matchedName + " ");
    if (isPrefix) {
      const coverage = cTokens.size / rTokens.size;
      score = Math.min(FUZZY_CAP, 0.55 + 0.35 * coverage);
      reasons.push(`company name is a prefix (${Math.round(coverage * 100)}% of tokens)`);
    } else {
      score = 0.5 * c.similarity + 0.5 * jac;
      const nearIdentical = c.similarity >= 0.9 && jac >= 0.75;
      score = Math.min(nearIdentical ? NEAR_IDENTICAL_CAP : FUZZY_CAP, score);
      reasons.push(`similarity ${c.similarity.toFixed(2)}, shared words ${Math.round(jac * 100)}%`);
    }
    if (c.source === "FORMER_NAME") {
      score -= 0.03;
      reasons.push("via former SEC name");
    }
  }

  const extra = [...rTokens].filter((t) => DISTINGUISHING.has(t) && !cTokens.has(t));
  if (extra.length) {
    score -= DISTINGUISHING_PENALTY;
    reasons.push(`recipient name has "${extra.join(", ")}"`);
  }

  return { ...c, score: round(Math.max(0, score)), method, reasons };
}

/** Pick the best company for a recipient name, or null when nothing is good enough. */
export function decide(recipientName: string, recipientType: string, candidates: Candidate[]): MatchDecision {
  if (NON_BUSINESS_TYPES.has(recipientType)) return { best: null, candidates: [] };

  // Keep each company's best-scoring candidate (it may match by name and by alias).
  const byCik = new Map<string, ScoredCandidate>();
  for (const c of candidates) {
    const s = scoreCandidate(recipientName, c);
    const prev = byCik.get(s.cik);
    if (!prev || s.score > prev.score) byCik.set(s.cik, s);
  }
  const ranked = [...byCik.values()].sort((a, b) => b.score - a.score);
  if (!ranked.length) return { best: null, candidates: [] };

  const best = { ...ranked[0], reasons: [...ranked[0].reasons] };
  if (ranked[1] && best.score - ranked[1].score < AMBIGUITY_GAP) {
    best.score = round(Math.max(0, best.score - AMBIGUITY_PENALTY));
    best.reasons.push(`ambiguous: ${ranked[1].ticker} scores ${ranked[1].score}`);
  }
  return { best: best.score >= MIN_STORED_CONFIDENCE ? best : null, candidates: ranked.slice(0, 5) };
}

/** Confidence a subsidiary inherits from its parent's match. */
export function inheritedConfidence(parentConfidence: number): number {
  return round(parentConfidence * mappingConfig.rollupFactor);
}
