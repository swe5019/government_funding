import * as Sentry from "@sentry/node";
import { scrubEvent } from "./scrub";

let enabled = false;

/** Error monitoring for the ingestion CLI (runs outside Next.js). Inactive unless SENTRY_DSN is set. */
export function initJobMonitoring(job: string) {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? "ingest",
    dataCollection: { userInfo: false },
    beforeSend: (event) => scrubEvent(event),
    initialScope: { tags: { component: "ingest", job } },
  });
  enabled = true;
}

export function reportJobError(err: unknown, job: string) {
  if (enabled) Sentry.captureException(err, { tags: { job } });
}

export async function flushJobMonitoring() {
  if (enabled) await Sentry.flush(5_000);
}
