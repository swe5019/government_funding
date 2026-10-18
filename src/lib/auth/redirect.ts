/** Only allow same-site relative paths as post-login destinations (no open redirects). */
export function safeCallbackUrl(raw: unknown, fallback = "/account"): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
