import type { ProgramRules } from "@/config/programs";
import { CONFIRMED_SQL } from "@/lib/mapping/sql";

const REGEX_SPECIAL = /[\\^$.*+?()[\]{}|]/g;

/**
 * Postgres regex (case-insensitive with ~*) matching any phrase at the start of a word.
 * Whitespace inside a phrase matches any run of whitespace.
 */
export function wordStartPattern(phrases: string[]): string {
  return `\\m(${alternatives(phrases)})`;
}

/** Like wordStartPattern, but the phrase must also end at a word boundary. */
export function wholeWordPattern(words: string[]): string {
  return `\\m(${alternatives(words)})\\M`;
}

const alternatives = (phrases: string[]) =>
  phrases.map((p) => p.trim().replace(REGEX_SPECIAL, "\\$&").replace(/\s+/g, "\\s+")).join("|");

/**
 * Build a SQL predicate over "Award" a for a program's rules. Returns the WHERE fragment and
 * its parameters, numbered from `firstParam`. Rules are OR-ed; keywords only count inside the
 * listed agencies; excludeKeywords then remove matches. Throws for a program with no usable rule.
 */
export function rulesToSql(rules: ProgramRules, firstParam = 1): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${firstParam + params.length - 1}`;
  };
  const prefixes = (list: string[]) => list.map((x) => `${x.replace(/[\\%_]/g, (c) => "\\" + c)}%`);

  if (rules.assistanceListings?.length) parts.push(`a."assistanceListing" = ANY(${p(rules.assistanceListings)}::text[])`);
  if (rules.defCodes?.length) parts.push(`a."defCodes" && ${p(rules.defCodes)}::text[]`);
  if (rules.allFromAgencies?.length) parts.push(`a."awardingAgencyCode" = ANY(${p(rules.allFromAgencies)}::text[])`);
  if (rules.naicsPrefixes?.length) parts.push(`a."naicsCode" LIKE ANY(${p(prefixes(rules.naicsPrefixes))}::text[])`);
  if (rules.pscPrefixes?.length) parts.push(`a."pscCode" LIKE ANY(${p(prefixes(rules.pscPrefixes))}::text[])`);
  if (rules.keywords?.length || rules.wholeWords?.length) {
    if (!rules.agencyCodes?.length) throw new Error("keyword rules need agencyCodes");
    const text = [
      ...(rules.keywords?.length ? [`a.description ~* ${p(wordStartPattern(rules.keywords))}`] : []),
      ...(rules.wholeWords?.length ? [`a.description ~* ${p(wholeWordPattern(rules.wholeWords))}`] : []),
    ];
    const agencies = p(rules.agencyCodes);
    parts.push(`(a."awardingAgencyCode" = ANY(${agencies}::text[]) AND (${text.join(" OR ")}))`);
  }
  if (rules.recipientTickers?.length) {
    const tickers = p(rules.recipientTickers);
    parts.push(
      `a."recipientId" IN (SELECT tm."recipientId" FROM "TickerMatch" tm JOIN "Company" c ON c.cik = tm."companyCik"
        WHERE ${CONFIRMED_SQL} AND (c.ticker = ANY(${tickers}::text[]) OR c.tickers && ${tickers}::text[]))`,
    );
  }
  if (!parts.length) throw new Error("program has no rules");
  let sql = parts.length > 1 ? `(${parts.join(" OR ")})` : parts[0];
  if (rules.excludeKeywords?.length) {
    sql += ` AND NOT COALESCE(a.description ~* ${p(wordStartPattern(rules.excludeKeywords))}, false)`;
  }
  return { sql, params };
}
