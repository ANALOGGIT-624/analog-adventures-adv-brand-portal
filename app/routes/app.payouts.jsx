import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  PORTAL_TYPES,
  getPortalSnapshot,
  slugify,
  upsertMetaobject,
} from "../lib/brand-portal.server";
import {
  fromCents,
  getAttributedOrdersForReconciliation,
  reconcileCampaignOrders,
  toCents,
} from "../lib/payout-reconciliation.server";

async function payoutData(admin) {
  const [snapshot, orders] = await Promise.all([
    getPortalSnapshot(admin),
    getAttributedOrdersForReconciliation(admin),
  ]);
  const reconciliations = snapshot.campaigns.map((campaign) => {
    const reconciliation = reconcileCampaignOrders(orders, campaign.id);
    const payoutRule = snapshot.payoutRules.find(
      ({ id }) => id === campaign.payout_rule,
    );
    reconciliation.settlementDelayDays = Math.max(
      reconciliation.settlementDelayDays,
      Number(payoutRule?.settlement_delay_days || 0),
    );
    return { campaign, ...reconciliation };
  });
  return { snapshot, reconciliations };
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const { snapshot, reconciliations } = await payoutData(admin);
  return {
    campaigns: snapshot.campaigns,
    payoutRules: snapshot.payoutRules,
    payoutStatements: snapshot.payoutStatements,
    reconciliations,
  };
};

function dateOnly(value, fallback) {
  return String(value || fallback || new Date().toISOString()).slice(0, 10);
}

function settlementReadyAt(campaign, delayDays) {
  if (!campaign.closes_at) return null;
  const date = new Date(campaign.closes_at);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + Number(delayDays || 0));
  return date;
}

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const campaignId = String(formData.get("campaign_id") || "");
  const status = String(formData.get("status") || "draft");
  const confirmedPaid = formData.get("confirm_paid") === "true";
  const deductionsCents = Math.max(0, toCents(formData.get("deductions") || 0));

  if (!campaignId) {
    return { ok: false, error: "Choose a campaign to reconcile." };
  }
  if (!["draft", "approved", "paid"].includes(status)) {
    return { ok: false, error: "Choose a valid statement status." };
  }

  try {
    const { snapshot, reconciliations } = await payoutData(admin);
    const reconciliation = reconciliations.find(
      ({ campaign }) => campaign.id === campaignId,
    );
    if (!reconciliation) {
      return { ok: false, error: "The selected campaign was not found." };
    }
    const existingStatement = snapshot.payoutStatements.find(
      ({ campaign }) => campaign === campaignId,
    );
    if (String(existingStatement?.status).toLowerCase() === "paid") {
      return {
        ok: false,
        error:
          "This statement is already paid and locked. Create a separate adjustment instead of changing its settled totals.",
      };
    }
    if (reconciliation.unsupportedRuleCount) {
      return {
        ok: false,
        error:
          "One or more attributed lines use an unsupported payout method. Review the payout rule before creating a statement.",
      };
    }

    const campaign = reconciliation.campaign;
    const readyAt = settlementReadyAt(
      campaign,
      reconciliation.settlementDelayDays,
    );
    const canFinalize =
      ["closed", "archived"].includes(String(campaign.status).toLowerCase()) &&
      readyAt?.getTime() <= Date.now();
    if (status !== "draft" && !canFinalize) {
      return {
        ok: false,
        error:
          "This campaign is not closed and past its settlement delay. Save a draft statement until it becomes eligible.",
      };
    }
    if (status === "paid" && !confirmedPaid) {
      return {
        ok: false,
        error: "Confirm that the organization was paid before marking it paid.",
      };
    }

    const values = {
      statement_id: `PAYOUT-${campaign.handle}`,
      campaign: campaign.id,
      status,
      period_start: dateOnly(campaign.starts_at, reconciliation.firstOrderAt),
      period_end: dateOnly(campaign.closes_at, reconciliation.lastOrderAt),
      gross_revenue: fromCents(reconciliation.grossRevenueCents),
      refunds: fromCents(reconciliation.refundsCents),
      deductions: fromCents(deductionsCents),
      organization_proceeds: fromCents(
        Math.max(0, reconciliation.proceedsCents - deductionsCents),
      ),
      currency: reconciliation.currency,
    };
    if (status === "paid") values.paid_at = new Date().toISOString();

    const statement = await upsertMetaobject(admin, {
      type: PORTAL_TYPES.payoutStatement,
      handle: slugify(values.statement_id),
      values,
    });
    return {
      ok: true,
      statement,
      campaignName: campaign.campaign_name,
      orderCount: reconciliation.orderCount,
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
};

function moneyFromCents(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(Number(value || 0) / 100);
}

function money(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(Number(value || 0));
}

function settlementDate(campaign, delayDays) {
  const date = settlementReadyAt(campaign, delayDays);
  return date ? date.toLocaleDateString() : "Set a campaign close date";
}

export default function Payouts() {
  const { campaigns, payoutRules, payoutStatements, reconciliations } =
    useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show(`${fetcher.data.campaignName} statement reconciled`);
    }
  }, [fetcher.data, shopify]);

  return (
    <s-page
      heading="Payouts"
      subheading="Reconcile verified campaign orders and refunds before approving organization proceeds."
    >
      {fetcher.data?.error && (
        <s-banner heading="Statement was not saved" tone="critical">
          {fetcher.data.error}
        </s-banner>
      )}

      <s-section heading="Campaign reconciliation">
        {reconciliations.length === 0 ? (
          <s-paragraph>
            Create a campaign before reconciling payouts.
          </s-paragraph>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Campaign</s-table-header>
              <s-table-header>Orders</s-table-header>
              <s-table-header>Eligible units</s-table-header>
              <s-table-header>Gross revenue</s-table-header>
              <s-table-header>Refunds</s-table-header>
              <s-table-header>Calculated proceeds</s-table-header>
              <s-table-header>Settlement eligible</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {reconciliations.map((reconciliation) => (
                <s-table-row key={reconciliation.campaign.id}>
                  <s-table-cell>
                    {reconciliation.campaign.campaign_name}
                  </s-table-cell>
                  <s-table-cell>{reconciliation.orderCount}</s-table-cell>
                  <s-table-cell>{reconciliation.eligibleUnits}</s-table-cell>
                  <s-table-cell>
                    {moneyFromCents(
                      reconciliation.grossRevenueCents,
                      reconciliation.currency,
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    {moneyFromCents(
                      reconciliation.refundsCents,
                      reconciliation.currency,
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    {moneyFromCents(
                      reconciliation.proceedsCents,
                      reconciliation.currency,
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    {settlementDate(
                      reconciliation.campaign,
                      reconciliation.settlementDelayDays,
                    )}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Create or update statement">
        <s-paragraph>
          Re-running this action replaces the campaign statement with current
          Shopify order and refund totals. Keep it in draft until the return
          window and settlement delay have passed.
        </s-paragraph>
        <fetcher.Form method="post">
          <s-stack direction="block" gap="base">
            <s-select label="Campaign" name="campaign_id" required>
              <s-option value="">Select a campaign</s-option>
              {campaigns.map((campaign) => (
                <s-option key={campaign.id} value={campaign.id}>
                  {campaign.campaign_name}
                </s-option>
              ))}
            </s-select>
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-money-field
                label="Manual deductions"
                name="deductions"
                min={0}
                value="0.00"
              />
              <s-select label="Statement status" name="status">
                <s-option value="draft">Draft</s-option>
                <s-option value="approved">Approved</s-option>
                <s-option value="paid">Paid</s-option>
              </s-select>
            </s-grid>
            <s-checkbox
              label="I confirm the organization has been paid (required only for Paid status)"
              name="confirm_paid"
              value="true"
            />
            <s-button type="submit" variant="primary" loading={busy}>
              Reconcile and save statement
            </s-button>
          </s-stack>
        </fetcher.Form>
      </s-section>

      <s-section heading="Payout rules">
        {payoutRules.length === 0 ? (
          <s-banner heading="A payout rule is required" tone="warning">
            Create a fixed-dollar or percentage payout rule in Shopify custom
            data before launching an organization campaign.
          </s-banner>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Rule</s-table-header>
              <s-table-header>Method</s-table-header>
              <s-table-header>Rate</s-table-header>
              <s-table-header>Basis</s-table-header>
              <s-table-header>Settlement delay</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {payoutRules.map((rule) => (
                <s-table-row key={rule.id}>
                  <s-table-cell>{rule.rule_name}</s-table-cell>
                  <s-table-cell>{rule.method}</s-table-cell>
                  <s-table-cell>{rule.rate}</s-table-cell>
                  <s-table-cell>{rule.basis}</s-table-cell>
                  <s-table-cell>
                    {rule.settlement_delay_days || "0"} days
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Payout statements">
        {payoutStatements.length === 0 ? (
          <s-paragraph>
            Statements will appear here after a campaign is reconciled.
          </s-paragraph>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Statement</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Gross revenue</s-table-header>
              <s-table-header>Refunds</s-table-header>
              <s-table-header>Deductions</s-table-header>
              <s-table-header>Organization proceeds</s-table-header>
              <s-table-header>Paid</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {payoutStatements.map((statement) => (
                <s-table-row key={statement.id}>
                  <s-table-cell>{statement.statement_id}</s-table-cell>
                  <s-table-cell>
                    <s-badge
                      tone={
                        String(statement.status).toLowerCase() === "paid"
                          ? "success"
                          : "info"
                      }
                    >
                      {statement.status}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    {money(statement.gross_revenue, statement.currency)}
                  </s-table-cell>
                  <s-table-cell>
                    {money(statement.refunds, statement.currency)}
                  </s-table-cell>
                  <s-table-cell>
                    {money(statement.deductions, statement.currency)}
                  </s-table-cell>
                  <s-table-cell>
                    {money(statement.organization_proceeds, statement.currency)}
                  </s-table-cell>
                  <s-table-cell>{statement.paid_at || "Pending"}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
