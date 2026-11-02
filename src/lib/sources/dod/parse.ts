import { createHash } from "node:crypto";
import { normalizeName } from "@/lib/mapping/normalize";
import { decodeEntities, htmlToText, paragraphs } from "@/lib/sources/html";

/**
 * Parser for defense.gov "Contracts for <date>" pages. Each contract is one paragraph:
 *   "Lockheed Martin Corp., Fort Worth, Texas, is awarded a $1,234,567 ... contract (N00019-24-C-0001)
 *    for ... Naval Air Systems Command, Patuxent River, Maryland, is the contracting activity."
 * Branch headings (ARMY, NAVY, ...) are short all-caps paragraphs. Amounts in these announcements
 * are often ceilings/potential values, so the UI labels them as announced amounts.
 */

export interface DodContract {
  id: string;
  branch: string | null;
  text: string;
  contractorName: string;
  normalizedName: string;
  amount: number | null;
  contractNumber: string | null;
  contractingActivity: string | null;
}

const BRANCHES = /^(ARMY|NAVY|AIR FORCE|SPACE FORCE|MARINE CORPS|DEFENSE LOGISTICS AGENCY|DEFENSE [A-Z ]+|[A-Z][A-Z .&,'-]{2,60})$/;
const AWARD_VERB = /\b(is|was|has been|have been|are|were)\s+(being\s+)?awarded\b|\bawarded\b/i;
/** DoD PIIDs: activity code (6 alnum), FY, type letter, serial (e.g. N00019-24-C-0001, FA8625-26-C-0042). */
export const PIID = /\b([A-Z0-9]{6})-(\d{2})-([A-Z])-([A-Z0-9]{4})\b/;

export function parseAmount(text: string): number | null {
  const m = /\$\s?([\d,]+(?:\.\d{1,2})?)(?:\s*(million|billion))?/i.exec(text);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  const mult = m[2]?.toLowerCase() === "billion" ? 1e9 : m[2]?.toLowerCase() === "million" ? 1e6 : 1;
  return Number.isFinite(n) ? n * mult : null;
}

/** "N00019-24-C-0001" -> "N0001924C0001" (USAspending PIID format). */
export const compactPiid = (piid: string) => piid.replace(/-/g, "");

/** "…Naval Air Systems Command, Patuxent River, Maryland, is the contracting activity" -> "Naval Air Systems Command". */
function contractingActivity(text: string): string | null {
  const idx = text.search(/\bis the contracting activity\b/i);
  if (idx < 0) return null;
  const sentence = text.slice(0, idx).split(/\.\s+(?=[A-Z])/).pop() ?? "";
  const name = sentence.split(",")[0].trim();
  return name || null;
}

export function parseContractsPage(html: string): DodContract[] {
  const out: DodContract[] = [];
  let branch: string | null = null;
  for (const raw of paragraphs(html)) {
    const text = htmlToText(raw).replace(/\n/g, " ").trim();
    if (!text) continue;
    if (text.length <= 60 && BRANCHES.test(text) && text === text.toUpperCase()) {
      branch = text;
      continue;
    }
    if (!AWARD_VERB.test(text) || !/\$\s?\d/.test(text)) continue;
    const contractorName = text.split(",")[0].replace(/^\*+/, "").trim();
    if (!contractorName || contractorName.length > 120) continue;
    const piid = PIID.exec(text);
    out.push({
      id: createHash("sha256").update(text.toLowerCase()).digest("hex"),
      branch,
      text,
      contractorName,
      normalizedName: normalizeName(contractorName),
      amount: parseAmount(text),
      contractNumber: piid ? piid[0] : null,
      contractingActivity: contractingActivity(text),
    });
  }
  return out;
}

export interface RssItem {
  title: string;
  link: string;
  pubDate: Date | null;
  /** Article HTML when the feed embeds it (content:encoded or description), else "". */
  contentHtml: string;
}

export function parseRss(xml: string): RssItem[] {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => {
    const inner = (tag: string) =>
      new RegExp(`<${tag}\\b[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, "i").exec(m[0])?.[1] ?? "";
    const get = (tag: string) => htmlToText(inner(tag));
    // Embedded article HTML; without CDATA it arrives entity-escaped (&lt;p&gt;).
    const html = (tag: string) => {
      const v = inner(tag);
      return /&lt;p\b/i.test(v) ? decodeEntities(v) : v;
    };
    const d = get("pubDate");
    return {
      title: get("title"),
      link: get("link"),
      pubDate: d ? new Date(d) : null,
      contentHtml: html("content:encoded") || html("description"),
    };
  });
}

/** "Contracts For Oct. 17, 2026" -> 2026-10-17, falling back to the RSS date. */
export function announcementDate(title: string, pubDate: Date | null): string | null {
  const m = /For\s+([A-Z][a-z]+)\.?\s+(\d{1,2}),\s+(\d{4})/.exec(title);
  if (m) {
    const d = new Date(`${m[1]} ${m[2]}, ${m[3]} 00:00:00 UTC`);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return pubDate && !Number.isNaN(pubDate.getTime()) ? pubDate.toISOString().slice(0, 10) : null;
}
