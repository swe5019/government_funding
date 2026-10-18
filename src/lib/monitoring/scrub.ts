/**
 * Strip secrets and personal data from error events before they leave the process: cookies,
 * auth headers and API keys in URLs (SAM.gov keys travel as ?api_key=). Shared by every Sentry init.
 */
type Ev = {
  request?: { cookies?: unknown; headers?: Record<string, string>; url?: string; query_string?: unknown; data?: unknown };
  user?: unknown;
};

const SECRET_PARAMS = /([?&](?:api_key|apikey|key|token|code|state|email)=)[^&#\s]*/gi;

export function scrubUrl(url: string): string {
  return url.replace(SECRET_PARAMS, "$1[redacted]");
}

export function scrubEvent<T extends Ev>(event: T): T {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.headers) {
      for (const h of Object.keys(event.request.headers)) {
        if (/cookie|authorization|stripe-signature/i.test(h)) delete event.request.headers[h];
      }
    }
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
  }
  delete event.user;
  return event;
}
