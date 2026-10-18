import { featureConfig } from "@/config/features";
import { csvResponse, toCsv } from "@/lib/csv";
import { getLargeAwardsFeed } from "@/lib/feed";
import { exportViewer, today } from "@/lib/gating/export";
import { matchDisplay } from "@/lib/mapping/display";

export async function GET(req: Request) {
  const gate = await exportViewer();
  if (gate instanceof Response) return gate;
  const sp = new URL(req.url).searchParams;
  const minUsd = Math.max(0, Number(sp.get("minUsd")) || featureConfig.feed.defaultMinUsd);
  const days = Math.min(90, Math.max(1, Number(sp.get("days")) || featureConfig.feed.defaultDays));
  const rows = await getLargeAwardsFeed(gate.win, { minUsd, days, limit: featureConfig.export.maxRows });
  const csv = toCsv(
    ["published", "action_date", "ticker", "company", "link", "obligation_usd", "recipient", "agency", "description", "source_url"],
    rows.map((r) => [r.availableAt, r.actionDate, r.ticker, r.companyName,
      matchDisplay({ status: r.matchStatus, confidence: r.matchConfidence, companyCik: r.matchCik }) === "possible" ? "possible match" : "confirmed",
      r.obligation, r.recipientName, r.agencyName, r.description, r.sourceUrl]),
  );
  return csvResponse(`large-awards-${today()}.csv`, csv);
}
