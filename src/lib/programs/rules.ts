import type { ProgramRules } from "@/config/programs";

/**
 * Build a SQL predicate over "Award" a for a program's rules. Returns the WHERE fragment and
 * its parameters, numbered from `firstParam`. Rules are OR-ed; keywords only count inside
 * the listed agencies. Throws for a program with no usable rule.
 */
export function rulesToSql(rules: ProgramRules, firstParam = 1): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${firstParam + params.length - 1}`;
  };

  if (rules.assistanceListings?.length) parts.push(`a."assistanceListing" = ANY(${p(rules.assistanceListings)}::text[])`);
  if (rules.defCodes?.length) parts.push(`a."defCodes" && ${p(rules.defCodes)}::text[]`);
  if (rules.keywords?.length) {
    if (!rules.agencyCodes?.length) throw new Error("keyword rules need agencyCodes");
    const patterns = rules.keywords.map((k) => `%${k.replace(/[\\%_]/g, (c) => "\\" + c)}%`);
    parts.push(
      `(a."awardingAgencyCode" = ANY(${p(rules.agencyCodes)}::text[]) AND a.description ILIKE ANY(${p(patterns)}::text[]))`,
    );
  }
  if (!parts.length) throw new Error("program has no rules");
  return { sql: parts.join(" OR "), params };
}
