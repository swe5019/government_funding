import { dataConfig } from "@/config/data";
import type { FederalRegisterQuery } from "@/config/programs";
import { createJsonFetcher } from "@/lib/sources/http";

/** federalregister.gov API (no key). https://www.federalregister.gov/developers/documentation/api/v1 */
const getJson = createJsonFetcher({ minGapMs: 500 });

export interface FrDocument {
  document_number: string;
  title: string;
  type: string;
  abstract: string | null;
  publication_date: string;
  html_url: string;
  agencies: { name?: string; raw_name?: string }[];
}

interface FrPage {
  count: number;
  results?: FrDocument[];
  next_page_url?: string | null;
}

const FIELDS = ["document_number", "title", "type", "abstract", "publication_date", "html_url", "agencies"];

export function searchUrl(term: string, q: FederalRegisterQuery, since: string): string {
  const p = new URLSearchParams();
  p.set("conditions[term]", term);
  p.set("conditions[publication_date][gte]", since);
  for (const a of q.agencies ?? []) p.append("conditions[agencies][]", a);
  for (const t of ["RULE", "PRORULE", "NOTICE"]) p.append("conditions[type][]", t);
  for (const f of FIELDS) p.append("fields[]", f);
  p.set("per_page", "100");
  p.set("order", "newest");
  return `${dataConfig.federalRegister.apiBase}/documents.json?${p}`;
}

/** All documents matching any of the program's terms since a date (follows pagination, max 10 pages/term). */
export async function searchDocuments(q: FederalRegisterQuery, since: string, fetchPage: (url: string) => Promise<FrPage> = getJson): Promise<FrDocument[]> {
  const byNumber = new Map<string, FrDocument>();
  for (const term of q.terms) {
    let url: string | null | undefined = searchUrl(term, q, since);
    for (let page = 0; url && page < 10; page++) {
      const res: FrPage = await fetchPage(url);
      for (const d of res.results ?? []) byNumber.set(d.document_number, d);
      url = res.next_page_url;
    }
  }
  return [...byNumber.values()];
}
