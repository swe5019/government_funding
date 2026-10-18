export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  /** Return false to stop retrying (e.g. a 400 that will never succeed). */
  shouldRetry?: (err: unknown) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}

/** Exponential backoff with jitter: base, 2x base, 4x base... (+/- 20%). */
export async function retry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === opts.attempts || (opts.shouldRetry && !opts.shouldRetry(err))) break;
      const delay = Math.round(opts.baseDelayMs * 2 ** (attempt - 1) * (0.8 + Math.random() * 0.4));
      opts.onRetry?.(err, attempt, delay);
      await sleep(delay);
    }
  }
  throw lastErr;
}
