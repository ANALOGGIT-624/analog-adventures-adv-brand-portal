import { useState } from "react";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getCampaignReportData } from "../lib/campaign-report.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const { snapshot, reconciliations } = await getCampaignReportData(admin);
  return {
    campaigns: reconciliations.map((reconciliation) => ({
      id: reconciliation.campaign.id,
      campaignId: reconciliation.campaign.campaign_id,
      name: reconciliation.campaign.campaign_name,
      status: reconciliation.campaign.status,
      orders: reconciliation.orderCount,
      productionLines: reconciliation.orders.reduce(
        (total, order) => total + order.lines.length,
        0,
      ),
      statementStatus:
        snapshot.payoutStatements.find(
          ({ campaign }) => campaign === reconciliation.campaign.id,
        )?.status || "Not reconciled",
    })),
  };
};

function reportUrl(campaignId, kind) {
  const query = new URLSearchParams({ campaign_id: campaignId, report: kind });
  return `/app/report-download?${query}`;
}

export default function Reports() {
  const { campaigns } = useLoaderData();
  const shopify = useAppBridge();
  const [downloading, setDownloading] = useState("");

  const downloadReport = async (campaign, kind, label) => {
    const downloadId = `${campaign.id}-${kind}`;
    setDownloading(downloadId);
    try {
      const response = await fetch(reportUrl(campaign.id, kind), {
        headers: { Accept: "text/csv" },
      });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.includes("text/csv")) {
        const message = await response.text();
        throw new Error(
          message && message.length < 240
            ? message
            : "The report server did not return a CSV file.",
        );
      }

      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${campaign.campaignId}-${kind}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      shopify.toast.show(`${label} report downloaded`);
    } catch (error) {
      shopify.toast.show(error.message || "Report download failed", {
        isError: true,
      });
    } finally {
      setDownloading("");
    }
  };

  return (
    <s-page
      heading="Reports and production exports"
      subheading="Download campaign records calculated from verified Shopify order attribution."
    >
      <s-section heading="Campaign exports">
        {campaigns.length === 0 ? (
          <s-banner heading="No campaigns available" tone="info">
            Create a campaign before downloading reports.
          </s-banner>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Campaign</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Orders</s-table-header>
              <s-table-header>Production lines</s-table-header>
              <s-table-header>Statement</s-table-header>
              <s-table-header>Downloads</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {campaigns.map((campaign) => (
                <s-table-row key={campaign.id}>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-200">
                      <s-text type="strong">{campaign.name}</s-text>
                      <s-text color="subdued">{campaign.campaignId}</s-text>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{campaign.status}</s-table-cell>
                  <s-table-cell>{campaign.orders}</s-table-cell>
                  <s-table-cell>{campaign.productionLines}</s-table-cell>
                  <s-table-cell>{campaign.statementStatus}</s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small">
                      <s-button
                        onClick={() =>
                          downloadReport(campaign, "sales", "Sales")
                        }
                        loading={downloading === `${campaign.id}-sales`}
                        variant="secondary"
                      >
                        Sales
                      </s-button>
                      <s-button
                        onClick={() =>
                          downloadReport(campaign, "production", "Production")
                        }
                        loading={downloading === `${campaign.id}-production`}
                        variant="secondary"
                      >
                        Production
                      </s-button>
                      <s-button
                        onClick={() =>
                          downloadReport(campaign, "payout", "Payout")
                        }
                        loading={downloading === `${campaign.id}-payout`}
                        variant="secondary"
                      >
                        Payout
                      </s-button>
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Export safeguards">
        <s-unordered-list>
          <s-list-item>
            Only server-verified attributed orders are included.
          </s-list-item>
          <s-list-item>
            Refunds, cancellations, and fulfillment quantities use the same
            reconciliation logic as payout statements.
          </s-list-item>
          <s-list-item>
            Production rows retain the approved proof version recorded at the
            time of purchase.
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}
