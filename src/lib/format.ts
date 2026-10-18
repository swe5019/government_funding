type Num = number | string | { toString(): string } | null | undefined;

const toNum = (v: Num) => (v === null || v === undefined ? 0 : Number(v.toString()));

/** $1.25B, $48.5M, $750K, $1,200 */
export function formatUsdCompact(v: Num): string {
  const n = toNum(v);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(abs >= 1e10 ? 1 : 2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(abs >= 1e7 ? 1 : 2)}M`;
  if (abs >= 1e4) return `${sign}$${Math.round(abs / 1e3)}K`;
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatUsd(v: Num): string {
  return toNum(v).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export function formatMonth(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", timeZone: "UTC" });
}

const RECIPIENT_TYPE_LABELS: Record<string, string> = {
  BUSINESS: "Business",
  NONPROFIT: "Nonprofit",
  GOVERNMENT: "Government",
  HIGHER_ED: "Higher education",
  INDIVIDUAL: "Individuals / aggregated",
  OTHER: "Other",
  UNKNOWN: "Unknown",
};

export const recipientTypeLabel = (t: string) => RECIPIENT_TYPE_LABELS[t] ?? t;
