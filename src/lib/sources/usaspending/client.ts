import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dataConfig } from "@/config/data";
import { retry, sleep } from "@/lib/retry";
import { HttpError, isRetryable } from "@/lib/sources/http";
import type { FileKind } from "./rows";

/**
 * Minimal USAspending API client. No API key; we space requests out and back off on
 * 429/5xx. Docs: https://api.usaspending.gov/docs/endpoints
 */

const cfg = dataConfig.usaspending;
const CONTRACT_TYPES = ["A", "B", "C", "D", "IDV_A", "IDV_B", "IDV_B_A", "IDV_B_B", "IDV_B_C", "IDV_C", "IDV_D", "IDV_E"];
const ASSISTANCE_TYPES = ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11"];

let lastRequestAt = 0;

async function politeFetch(url: string, init?: RequestInit): Promise<Response> {
  const wait = lastRequestAt + cfg.minRequestGapMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new HttpError(res.status, `${init?.method ?? "GET"} ${url} -> ${res.status}: ${body.slice(0, 500)}`);
  }
  return res;
}

async function apiJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  return retry(async () => (await politeFetch(cfg.apiBase + pathname, init)).json() as Promise<T>, {
    attempts: 5,
    baseDelayMs: 2_000,
    shouldRetry: isRetryable,
  });
}

export interface BulkDownloadRequest {
  kind: FileKind;
  dateType: "action_date" | "last_modified_date";
  startDate: string;
  endDate: string;
}

interface DownloadStatus {
  status: "ready" | "running" | "finished" | "failed";
  file_name: string;
  file_url: string | null;
  message: string | null;
  total_rows?: number | null;
}

/** Ask USAspending to build a prime-transactions CSV zip. Returns the generated file name. */
export async function requestBulkDownload(req: BulkDownloadRequest): Promise<string> {
  const body = {
    filters: {
      prime_award_types: req.kind === "contracts" ? CONTRACT_TYPES : ASSISTANCE_TYPES,
      date_type: req.dateType,
      date_range: { start_date: req.startDate, end_date: req.endDate },
      agencies: [{ type: "awarding", tier: "toptier", name: "All" }],
    },
    file_format: "csv",
  };
  const res = await apiJson<{ file_name: string }>("/api/v2/bulk_download/awards/", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.file_name;
}

/** Poll until the bulk file is ready; returns its download URL. */
export async function waitForDownload(fileName: string, log: (msg: string) => void): Promise<string> {
  const deadline = Date.now() + cfg.downloadTimeoutMs;
  while (Date.now() < deadline) {
    const s = await apiJson<DownloadStatus>(
      `/api/v2/download/status/?file_name=${encodeURIComponent(fileName)}`,
    );
    if (s.status === "finished" && s.file_url) return s.file_url;
    if (s.status === "failed") throw new Error(`USAspending download ${fileName} failed: ${s.message ?? "no message"}`);
    log(`download ${fileName}: ${s.status}${s.total_rows ? ` (${s.total_rows} rows)` : ""}`);
    await sleep(cfg.downloadPollMs);
  }
  throw new Error(`USAspending download ${fileName} not ready after ${cfg.downloadTimeoutMs / 60000} min`);
}

/** Stream a (potentially multi-GB) file to disk. */
export async function downloadToFile(url: string, dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const dest = path.join(dir, path.basename(new URL(url).pathname));
  await retry(
    async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(cfg.downloadTimeoutMs) });
      if (!res.ok || !res.body) throw new HttpError(res.status, `GET ${url} -> ${res.status}`);
      await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(dest));
    },
    { attempts: 4, baseDelayMs: 5_000, shouldRetry: isRetryable },
  );
  return dest;
}

export interface ToptierAgency {
  toptier_code: string;
  agency_name: string;
  abbreviation: string | null;
}

/** All toptier agencies with abbreviations (the bulk files only carry codes and names). */
export async function fetchToptierAgencies(): Promise<ToptierAgency[]> {
  const res = await apiJson<{ results: ToptierAgency[] }>("/api/v2/references/toptier_agencies/");
  return res.results;
}
