import { matchDisplay, type MatchLike } from "@/lib/mapping/display";

/**
 * Ticker label for a recipient. Sub-threshold matches are always labeled "possible match";
 * rejected or missing matches render nothing.
 */
export function MatchBadge({ match, ticker }: { match: MatchLike | null; ticker: string | null }) {
  const display = matchDisplay(match);
  if (display === "hidden" || !ticker) return null;
  if (display === "confirmed") {
    return (
      <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-accent">
        {ticker}
      </span>
    );
  }
  return (
    <span
      className="rounded border border-warn-fg/40 bg-warn-bg px-1.5 py-0.5 text-xs text-warn-fg"
      title="Low-confidence link between this recipient and a public company. Not verified."
    >
      Possible match: <span className="font-mono font-semibold">{ticker}</span>
    </span>
  );
}
