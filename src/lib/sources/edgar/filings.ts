import { decodeEntities, htmlToText } from "@/lib/sources/html";
import type { Submissions } from "./client";

/** EDGAR filing helpers: recent filings from submissions JSON, 8-K screening, Exhibit 21 parsing. */

export interface RecentFiling {
  accession: string;
  form: string;
  filedAt: string;
  items: string | null;
  title: string | null;
  url: string;
  primaryDocument: string;
}

export const archiveBase = (cik: string, accession: string) =>
  `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}`;

/** Filings of the given forms filed on/after `since` (YYYY-MM-DD), newest first. */
export function recentFilings(sub: Submissions, cik: string, forms: string[], since: string): RecentFiling[] {
  const r = sub.filings?.recent;
  if (!r) return [];
  const out: RecentFiling[] = [];
  for (let i = 0; i < r.accessionNumber.length; i++) {
    if (!forms.includes(r.form[i]) || r.filingDate[i] < since) continue;
    out.push({
      accession: r.accessionNumber[i],
      form: r.form[i],
      filedAt: r.filingDate[i],
      items: r.items?.[i] || null,
      title: r.primaryDocDescription?.[i] || null,
      primaryDocument: r.primaryDocument[i],
      url: `${archiveBase(cik, r.accessionNumber[i])}/${r.primaryDocument[i]}`,
    });
  }
  return out.sort((a, b) => b.filedAt.localeCompare(a.filedAt));
}

const AGENCY_TERMS = [
  "Department of Defense",
  "U.S. Army",
  "U.S. Navy",
  "U.S. Air Force",
  "U.S. Space Force",
  "Missile Defense Agency",
  "NASA",
  "Department of Energy",
  "Department of Homeland Security",
  "Department of Commerce",
  "Department of Veterans Affairs",
  "Department of Health and Human Services",
  "CHIPS",
  "U.S. government",
  "federal government",
];
const CONTRACT_TERMS = [
  "awarded a contract",
  "contract award",
  "was awarded",
  "has been awarded",
  "task order",
  "delivery order",
  "IDIQ",
  "indefinite-delivery",
  "definitive agreement",
  "preliminary memorandum of terms",
  "grant agreement",
  "direct funding",
];

/**
 * Cheap keyword screen: does this 8-K look like it announces a government contract or award?
 * Needs both an agency/government term and a contract term. A screen, not a classifier — the UI
 * labels results as "may relate to federal contracts".
 */
export function screenForGovernmentContract(text: string): { mentionsAward: boolean; matchedTerms: string[] } {
  const lower = text.toLowerCase();
  const agencies = AGENCY_TERMS.filter((t) => lower.includes(t.toLowerCase()));
  const contracts = CONTRACT_TERMS.filter((t) => lower.includes(t.toLowerCase()));
  return { mentionsAward: agencies.length > 0 && contracts.length > 0, matchedTerms: [...agencies, ...contracts].slice(0, 6) };
}

/** Exhibit 21 document links from a filing index page (…-index.htm). */
export function exhibit21Links(indexHtml: string, cik: string, accession: string): string[] {
  const links: string[] = [];
  for (const row of indexHtml.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
    if (!/>\s*EX-21(\.\d+)?\s*</i.test(row[0])) continue;
    const href = /href="([^"]+)"/i.exec(row[0])?.[1];
    if (!href) continue;
    links.push(href.startsWith("http") ? href : href.startsWith("/") ? `https://www.sec.gov${href}` : `${archiveBase(cik, accession)}/${href}`);
  }
  return links;
}

const HEADER_WORDS = /^(name|names|subsidiar|exhibit|list of|jurisdiction|state or|country|percentage|percent|ownership|incorporat|organized|the following|as of|page \d|\d+$)/i;
/** A subsidiary name must end in a legal form; precision matters more than recall for matching. */
const LEGAL_SUFFIX = /\b(inc|incorporated|corp|corporation|co|company|llc|l\.l\.c|lp|l\.p|llp|ltd|limited|plc|gmbh|ag|s\.a|sa|b\.v|bv|n\.v|nv|s\.a\.r\.l|sarl|pty|pte|kk|k\.k|ulc)\.?$/i;

function cleanName(raw: string): string | null {
  let s = decodeEntities(raw).replace(/\s+/g, " ").trim();
  // Drop trailing jurisdiction / ownership columns that got joined into the cell.
  s = s.replace(/\s*\((?:a |an )?[A-Z][A-Za-z .]+(?: corporation| limited liability company| company)?\)\s*$/i, "");
  s = s.replace(/\s{2,}.*$/, "").replace(/[*†‡]+$/, "").replace(/[,;:]$/, "").trim();
  if (s.length < 3 || s.length > 120 || !/[A-Za-z]{2}/.test(s) || HEADER_WORDS.test(s)) return null;
  return LEGAL_SUFFIX.test(s) ? s : null;
}

/** Subsidiary names from an Exhibit 21 document (HTML table or plain text). */
export function parseExhibit21(doc: string): string[] {
  const names = new Set<string>();
  const rows = [...doc.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)];
  if (rows.length) {
    for (const row of rows) {
      const cell = /<td\b[^>]*>([\s\S]*?)<\/td>/i.exec(row[0]);
      const name = cell ? cleanName(htmlToText(cell[1])) : null;
      if (name) names.add(name);
    }
  } else {
    const text = /<[a-z][\s\S]*>/i.test(doc) ? htmlToText(doc.replace(/<\/(p|div|li)>/gi, "\n")) : doc;
    for (const line of text.split(/\n/)) {
      const name = cleanName(line.split(/\s{2,}|\t/)[0]);
      if (name) names.add(name);
    }
  }
  return [...names];
}
