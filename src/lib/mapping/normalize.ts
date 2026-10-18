import { createHash } from "node:crypto";

/**
 * Legal-form and filler tokens dropped when comparing organization names.
 * "LOCKHEED MARTIN CORPORATION" and "Lockheed Martin Corp." both normalize to "LOCKHEED MARTIN".
 */
const STOP_TOKENS = new Set([
  "INC",
  "INCORPORATED",
  "CORP",
  "CORPORATION",
  "CO",
  "COMPANY",
  "LLC",
  "L L C",
  "LLP",
  "LP",
  "LTD",
  "LIMITED",
  "PLC",
  "NV",
  "SA",
  "AG",
  "GMBH",
  "HOLDINGS",
  "HOLDING",
  "GROUP",
  "THE",
  "DBA",
]);

/** Normalize an organization name for search and matching. */
export function normalizeName(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " AND ")
    // "L.L.C." -> "LLC", "U.S." -> "US"
    .replace(/\b([A-Z])\.(?=[A-Z]\.)/g, "$1")
    .replace(/\b([A-Z])\.(?=\s|$)/g, "$1")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = cleaned.split(" ").filter(Boolean);
  // Strip legal-form tokens from the end ("ACME HOLDINGS INC" -> "ACME"), but keep the
  // last token ("THE COMPANY" -> "COMPANY").
  const start = tokens[0] === "THE" && tokens.length > 1 ? 1 : 0;
  let end = tokens.length;
  while (end - start > 1 && STOP_TOKENS.has(tokens[end - 1])) end--;
  return tokens.slice(start, end).join(" ");
}

/**
 * Stable key for a recipient. UEI when available; otherwise a hash of name + location so
 * the same unidentified recipient (e.g. aggregated or redacted records) is reused across loads.
 */
export function recipientKey(input: {
  uei?: string | null;
  name: string;
  stateCode?: string | null;
  countryCode?: string | null;
}): string {
  const uei = input.uei?.trim().toUpperCase();
  if (uei) return uei;
  const basis = [normalizeName(input.name), input.stateCode ?? "", input.countryCode ?? ""].join("|");
  return "NOUEI:" + createHash("sha1").update(basis).digest("hex").slice(0, 24);
}
