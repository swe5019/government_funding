import Link from "next/link";
import { formatDate, formatDateTime, formatUsdCompact } from "@/lib/format";
import { getFreshness, getLiteHistoryMinimum } from "@/lib/recipients";
import type { Viewer } from "@/lib/gating/viewer";

/** "Last updated" line required on every data view. */
export async function LastUpdated({ viewer }: { viewer: Viewer }) {
  const [fresh, liteMin] = await Promise.all([getFreshness(), getLiteHistoryMinimum()]);
  const delay = viewer.entitlements.dataDelayDays;
  return (
    <p className="text-xs text-muted">
      {fresh ? (
        <>
          Last updated {formatDateTime(fresh.lastSuccessfulAt)} · source records modified through{" "}
          {formatDate(fresh.dataThrough)}
        </>
      ) : (
        <>No data loaded yet</>
      )}
      {liteMin && <> · Older history includes only awards of {formatUsdCompact(liteMin)} or more</>}
      {delay > 0 && (
        <>
          {" "}
          · Free plan: records appear {delay} days after publication.{" "}
          <Link href="/pricing?from=freshness" className="text-accent underline underline-offset-2">
            Get daily updates with Pro
          </Link>
        </>
      )}
    </p>
  );
}
