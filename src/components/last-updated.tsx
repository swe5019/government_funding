import { formatDate, formatDateTime } from "@/lib/format";
import { getFreshness } from "@/lib/recipients";
import type { Viewer } from "@/lib/gating/viewer";

/** "Last updated" line required on every data view. */
export async function LastUpdated({ viewer }: { viewer: Viewer }) {
  const fresh = await getFreshness();
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
      {delay > 0 && <> · Free plan: records appear {delay} days after publication</>}
    </p>
  );
}
