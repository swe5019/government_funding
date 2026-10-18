import { retry, sleep } from "@/lib/retry";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Retry on network errors, 429 and 5xx; fail fast on other 4xx. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 429 || err.status >= 500;
  return true;
}

/**
 * fetch JSON with a minimum gap between requests (per limiter instance) and backoff retries.
 * Each data source creates its own limiter sized to that source's published rate limit.
 */
export function createJsonFetcher(opts: { minGapMs: number; headers?: Record<string, string>; timeoutMs?: number }) {
  let last = 0;
  return async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
    return retry(
      async () => {
        const wait = last + opts.minGapMs - Date.now();
        if (wait > 0) await sleep(wait);
        last = Date.now();
        const res = await fetch(url, {
          ...init,
          headers: { accept: "application/json", ...opts.headers, ...init?.headers },
          signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          // Don't echo query strings: they can carry API keys.
          throw new HttpError(res.status, `${init?.method ?? "GET"} ${url.split("?")[0]} -> ${res.status}: ${body.slice(0, 300)}`);
        }
        return (await res.json()) as T;
      },
      { attempts: 5, baseDelayMs: 2_000, shouldRetry: isRetryable },
    );
  };
}

/** Like createJsonFetcher, for HTML/XML/text responses. */
export function createTextFetcher(opts: { minGapMs: number; headers?: Record<string, string>; timeoutMs?: number }) {
  let last = 0;
  return async function getText(url: string): Promise<string> {
    return retry(
      async () => {
        const wait = last + opts.minGapMs - Date.now();
        if (wait > 0) await sleep(wait);
        last = Date.now();
        const res = await fetch(url, { headers: opts.headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000) });
        if (!res.ok) throw new HttpError(res.status, `GET ${url.split("?")[0]} -> ${res.status}`);
        return res.text();
      },
      { attempts: 4, baseDelayMs: 2_000, shouldRetry: isRetryable },
    );
  };
}
