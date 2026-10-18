import { mappingConfig } from "@/config/mapping";

export type MatchDisplay = "confirmed" | "possible" | "hidden";

export interface MatchLike {
  status: string;
  confidence: number;
  companyCik: string | null;
}

/**
 * How a recipient→company match is shown to users. Single source of truth; the SQL in
 * src/lib/mapping/sql.ts (CONFIRMED_SQL) implements the same rule for aggregates.
 */
export function matchDisplay(m: MatchLike | null | undefined): MatchDisplay {
  if (!m || !m.companyCik || m.status === "REJECTED") return "hidden";
  if (m.status === "APPROVED" || m.status === "CORRECTED") return "confirmed";
  return m.confidence >= mappingConfig.confidenceThreshold ? "confirmed" : "possible";
}
