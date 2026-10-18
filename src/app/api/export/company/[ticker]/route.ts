import { featureConfig } from "@/config/features";
import { getCompanyAwardsForExport, getCompanyByTicker } from "@/lib/companies";
import { csvResponse, toCsv } from "@/lib/csv";
import { exportViewer, today } from "@/lib/gating/export";

export async function GET(_req: Request, ctx: RouteContext<"/api/export/company/[ticker]">) {
  const gate = await exportViewer();
  if (gate instanceof Response) return gate;
  const { ticker } = await ctx.params;
  const company = await getCompanyByTicker(decodeURIComponent(ticker));
  if (!company) return Response.json({ error: "Unknown ticker" }, { status: 404 });

  const rows = await getCompanyAwardsForExport(company.cik, gate.win, featureConfig.export.maxRows);
  const csv = toCsv(
    ["action_date", "published", "obligation_usd", "award_id", "piid_or_fain", "modification", "type", "description",
     "recipient", "recipient_uei", "link_to_company", "agency", "sub_agency", "source_url"],
    rows.map((r) => [r.actionDate, r.availableAt, r.obligation, r.awardId, r.displayId, r.modNumber, r.category, r.description,
      r.recipientName, r.recipientUei, r.linkMethod, r.agencyName, r.subAgencyName, r.sourceUrl]),
  );
  return csvResponse(`${company.ticker}-federal-awards-${today()}.csv`, csv);
}
