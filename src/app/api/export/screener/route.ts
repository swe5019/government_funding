import { featureConfig } from "@/config/features";
import { csvResponse, toCsv } from "@/lib/csv";
import { exportViewer, today } from "@/lib/gating/export";
import { parseScreenerFilters } from "@/lib/screener/filters";
import { runScreener } from "@/lib/screener/query";

export async function GET(req: Request) {
  const gate = await exportViewer();
  if (gate instanceof Response) return gate;
  const filters = parseScreenerFilters(Object.fromEntries(new URL(req.url).searchParams));
  const rows = await runScreener(filters, gate.win, new Date(), featureConfig.export.maxRows);
  const csv = toCsv(
    ["ticker", "company", "sector", "awards_last_12m_usd", "awards_prior_12m_usd", "growth_pct", "awards_to_market_cap_pct", "top_agency"],
    rows.map((r) => [r.ticker, r.name, r.sector, r.last12.toFixed(2), r.prior12.toFixed(2),
      r.growth === null ? null : (r.growth * 100).toFixed(1), r.toMarketCap === null ? null : (r.toMarketCap * 100).toFixed(3), r.topAgency]),
  );
  return csvResponse(`screener-${today()}.csv`, csv);
}
