import { formatUsdCompact } from "@/lib/format";

/** label · value · optional signed delta vs a named period. Up is shown as good (more federal money). */
export function StatTile({
  label,
  value,
  change,
  vsLabel,
}: {
  label: string;
  value: number;
  change?: number | null;
  vsLabel?: string;
}) {
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{formatUsdCompact(value)}</div>
      {vsLabel && (
        <div className="mt-1 text-xs text-muted">
          {change === null || change === undefined ? (
            <>No comparable spending {vsLabel}</>
          ) : (
            <>
              <span className={change >= 0 ? "text-delta-up" : "text-delta-down"}>
                <span aria-hidden>{change >= 0 ? "▲" : "▼"}</span> {change >= 0 ? "+" : "−"}
                {Math.abs(change * 100).toFixed(Math.abs(change) < 0.1 ? 1 : 0)}%
              </span>{" "}
              {vsLabel}
            </>
          )}
        </div>
      )}
    </div>
  );
}
