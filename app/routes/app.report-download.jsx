import { authenticate } from "../shopify.server";
import { slugify } from "../lib/brand-portal.server";
import { getCampaignReportData } from "../lib/campaign-report.server";
import {
  csvDocument,
  payoutReport,
  productionReport,
  salesReport,
} from "../lib/report-export.server";

const REPORTS = {
  sales: salesReport,
  production: productionReport,
  payout: payoutReport,
};

function downloadResponse(campaign, kind, report) {
  const filename = `${slugify(campaign.campaign_id || campaign.handle)}-${kind}.csv`;
  return new Response(csvDocument(report.columns, report.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const kind = url.searchParams.get("report");
  const campaignId = url.searchParams.get("campaign_id");

  if (!REPORTS[kind] || !campaignId) {
    throw new Response("Choose a valid campaign report.", { status: 400 });
  }

  const { snapshot, reconciliations } = await getCampaignReportData(admin);
  const reconciliation = reconciliations.find(
    ({ campaign }) => campaign.id === campaignId,
  );
  if (!reconciliation) {
    throw new Response("Campaign not found.", { status: 404 });
  }
  const statement = snapshot.payoutStatements.find(
    ({ campaign }) => campaign === campaignId,
  );
  const report = REPORTS[kind](reconciliation, statement);
  return downloadResponse(reconciliation.campaign, kind, report);
};
