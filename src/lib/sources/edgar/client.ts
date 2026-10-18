import { mappingConfig } from "@/config/mapping";
import { normalizeName } from "@/lib/mapping/normalize";
import { createJsonFetcher } from "@/lib/sources/http";

/**
 * SEC EDGAR. No key, but SEC requires a descriptive User-Agent with contact details and
 * allows at most 10 requests/second: https://www.sec.gov/os/accessing-edgar-data
 */

export const TICKERS_URL = "https://www.sec.gov/files/company_tickers_exchange.json";

function userAgent(): string {
  const ua = process.env.SEC_USER_AGENT;
  if (!ua || !ua.includes("@")) {
    throw new Error('SEC_USER_AGENT must be set to "<App name> <contact email>" (SEC fair-access policy)');
  }
  return ua;
}

let fetcher: ReturnType<typeof createJsonFetcher> | undefined;
function getJson<T>(url: string): Promise<T> {
  fetcher ??= createJsonFetcher({ minGapMs: 125, headers: { "user-agent": userAgent() } });
  return fetcher<T>(url);
}

export interface TickersFile {
  fields: string[];
  data: (string | number | null)[][];
}

export interface EdgarCompany {
  cik: string;
  name: string;
  normalizedName: string;
  ticker: string;
  tickers: string[];
  exchange: string | null;
  isMajorExchange: boolean;
}

export const padCik = (cik: string | number) => String(cik).padStart(10, "0");

/**
 * One entry per CIK. SEC lists a row per ticker (share classes, preferreds, warrants); the
 * first row for a CIK is its primary listing. A company counts as major-exchange if any of
 * its tickers trades on one.
 */
export function parseTickersFile(file: TickersFile): EdgarCompany[] {
  const idx = (f: string) => {
    const i = file.fields.indexOf(f);
    if (i < 0) throw new Error(`company tickers file missing field "${f}"`);
    return i;
  };
  const [iCik, iName, iTicker, iExchange] = [idx("cik"), idx("name"), idx("ticker"), idx("exchange")];
  const major = new Set<string>(mappingConfig.majorExchanges);
  const byCik = new Map<string, EdgarCompany>();

  for (const row of file.data) {
    const cik = row[iCik];
    const ticker = row[iTicker];
    const name = row[iName];
    if (cik === null || !ticker || !name) continue;
    const key = padCik(cik);
    const exchange = row[iExchange] ? String(row[iExchange]) : null;
    const t = String(ticker).toUpperCase();
    const existing = byCik.get(key);
    if (existing) {
      if (!existing.tickers.includes(t)) existing.tickers.push(t);
      if (exchange && major.has(exchange) && !existing.isMajorExchange) {
        existing.isMajorExchange = true;
        existing.exchange = exchange;
      }
      continue;
    }
    byCik.set(key, {
      cik: key,
      name: String(name),
      normalizedName: normalizeName(String(name)),
      ticker: t,
      tickers: [t],
      exchange,
      isMajorExchange: exchange !== null && major.has(exchange),
    });
  }
  return [...byCik.values()];
}

export async function fetchTickersFile(): Promise<TickersFile> {
  return getJson<TickersFile>(TICKERS_URL);
}

export interface Submissions {
  cik: string;
  name: string;
  sic?: string;
  sicDescription?: string;
  formerNames?: { name: string; from?: string; to?: string }[];
  filings?: {
    recent?: {
      accessionNumber: string[];
      filingDate: string[];
      form: string[];
      primaryDocument: string[];
      primaryDocDescription?: string[];
      items?: string[];
    };
  };
}

export async function fetchSubmissions(cik: string): Promise<Submissions> {
  return getJson<Submissions>(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`);
}

/** Raw text/HTML from sec.gov (filing indexes and documents), same rate limit and User-Agent. */
let textFetcher: ((url: string) => Promise<string>) | undefined;
export async function fetchSecText(url: string): Promise<string> {
  if (!textFetcher) {
    const { createTextFetcher } = await import("@/lib/sources/http");
    textFetcher = createTextFetcher({ minGapMs: 125, headers: { "user-agent": userAgent() } });
  }
  return textFetcher(url);
}
